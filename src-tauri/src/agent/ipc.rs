//! Local back-channel for the agent's UI-intent tools. `navigate` and
//! `propose_action` run inside the spawned `mercek --mcp` subprocess, which has no
//! link to the app's UI — so the subprocess hands the intent back to the running
//! app over a per-app Unix socket, where it's routed into the active turn's sink and
//! drives the panel (open a tab / pop the confirm dialog).
//!
//! Hardening: the socket lives in the per-user temp dir, is chmod'd to owner-only,
//! and a connection must present a per-process random token before any intent is
//! accepted — so another local process can't drive the panel. (The intents are also
//! non-executing: `propose_action` only opens a dialog the user must still confirm.)

use std::io::{BufRead, BufReader, Write};
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};

use crate::agent::session::AgentSink;
use crate::domain::AgentIntent;

/// Env vars carrying the socket path + auth token to the subprocess.
pub const SOCK_ENV: &str = "MERCEK_AGENT_SOCK";
pub const TOKEN_ENV: &str = "MERCEK_AGENT_TOKEN";

/// Per-app socket path — the pid keeps concurrent app instances from colliding.
/// Computed in the app process; handed to the subprocess via [`SOCK_ENV`].
pub fn socket_path() -> PathBuf {
    std::env::temp_dir().join(format!("mercek-agent-{}.sock", std::process::id()))
}

/// Per-process shared secret a connection must present before any intent is
/// accepted. Generated once; the app's listener checks it, the subprocess sends it.
pub fn token() -> &'static str {
    static TOKEN: OnceLock<String> = OnceLock::new();
    TOKEN.get_or_init(|| {
        use std::io::Read;
        let mut buf = [0u8; 24];
        if std::fs::File::open("/dev/urandom")
            .and_then(|mut f| f.read_exact(&mut buf))
            .is_ok()
        {
            buf.iter().map(|b| format!("{b:02x}")).collect()
        } else {
            // Fallback only; the owner-only socket perms are the real gate.
            format!("pid-{}", std::process::id())
        }
    })
}

/// Where the active turn's sink lives; the listener routes intents into it.
pub type IntentSink = Arc<StdMutex<Option<Arc<dyn AgentSink>>>>;

/// App side: accept connections from the subprocess and route each newline-delimited
/// [`AgentIntent`] to the active turn's sink. Runs on a dedicated thread for the
/// app's lifetime. Best-effort — a bind failure just leaves navigate/propose inert.
pub fn serve(sink: IntentSink) {
    let expected = token().to_string();
    std::thread::spawn(move || {
        let path = socket_path();
        let _ = std::fs::remove_file(&path);
        let listener = match std::os::unix::net::UnixListener::bind(&path) {
            Ok(l) => l,
            Err(e) => {
                tracing::warn!(error = %e, "agent intent socket: bind failed");
                return;
            }
        };
        // Owner-only — combined with the per-user temp dir, no other process connects.
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let expected = expected.clone();
            let sink = sink.clone();
            std::thread::spawn(move || {
                let mut lines = BufReader::new(stream).lines();
                // First line must be the shared secret, else drop the connection.
                match lines.next() {
                    Some(Ok(tok)) if tok == expected => {}
                    _ => return,
                }
                for line in lines {
                    let Ok(line) = line else { break };
                    if line.trim().is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<AgentIntent>(&line) {
                        Ok(intent) => {
                            if let Some(s) = sink.lock().unwrap_or_else(|e| e.into_inner()).clone() {
                                s.intent(intent);
                            }
                        }
                        Err(e) => tracing::warn!(error = %e, "agent intent socket: bad payload"),
                    }
                }
            });
        }
    });
}

/// Subprocess side: hand one intent to the app (token line first). Blocking + quick;
/// errs when no socket/token is attached (e.g. the plain `claude` CLI behind us).
pub fn send(intent: &AgentIntent) -> std::io::Result<()> {
    let nf = |what: &str| std::io::Error::new(std::io::ErrorKind::NotFound, what.to_string());
    let path = std::env::var_os(SOCK_ENV).ok_or_else(|| nf("no agent socket"))?;
    let tok = std::env::var(TOKEN_ENV).map_err(|_| nf("no agent token"))?;
    let mut stream = std::os::unix::net::UnixStream::connect(path)?;
    let mut payload = tok.into_bytes();
    payload.push(b'\n');
    payload.extend(serde_json::to_vec(intent).map_err(std::io::Error::other)?);
    payload.push(b'\n');
    stream.write_all(&payload)?;
    stream.flush()
}
