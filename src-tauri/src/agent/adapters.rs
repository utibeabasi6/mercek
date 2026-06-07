//! The connect/picker table. New harnesses are entries
//! here, not new code paths. `bin` is what we probe on `PATH` to decide
//! "detected"; spawning its ACP adapter is the ACP slice (`acp.rs`).

use crate::domain::AgentInfo;

pub struct Adapter {
    pub id: &'static str,
    pub name: &'static str,
    /// Binary we probe on PATH to decide "detected".
    pub bin: &'static str,
    /// Command line spawned to speak ACP over stdio (parsed by `AcpAgent::from_str`).
    pub acp_command: &'static str,
    /// Env var the harness reads to pick a model, if known. A user model preference
    /// is injected into the subprocess env under this name (best-effort per harness).
    pub model_env: Option<&'static str>,
    pub install_hint: &'static str,
}

pub const ADAPTERS: &[Adapter] = &[
    Adapter {
        id: "claude-code",
        name: "Claude Code",
        bin: "claude",
        // Run the ACP adapter via npx so it's fetched on demand rather than requiring a
        // global install. Pinned to an exact, audited version (not a floating tag) so a
        // future compromised/typosquatted publish can't be pulled in on the next run —
        // bump deliberately after vetting. (Upstream has since renamed this package to
        // @agentclientprotocol/claude-agent-acp; migrate when revisiting.)
        acp_command: "npx -y @zed-industries/claude-code-acp@0.16.2",
        model_env: Some("ANTHROPIC_MODEL"),
        install_hint: "needs Node/npx (Claude Code already implies it); the adapter is fetched on first run",
    },
    Adapter {
        id: "codex",
        name: "Codex CLI",
        bin: "codex",
        acp_command: "codex-acp",
        model_env: None,
        install_hint: "install Codex CLI: npm i -g @openai/codex",
    },
    Adapter {
        id: "gemini",
        name: "Gemini CLI",
        bin: "gemini",
        acp_command: "gemini --experimental-acp",
        model_env: Some("GEMINI_MODEL"),
        install_hint: "install Gemini CLI: npm i -g @google/gemini-cli",
    },
    Adapter {
        id: "kimi",
        name: "Kimi CLI",
        bin: "kimi",
        acp_command: "kimi --acp",
        model_env: None,
        install_hint: "install Kimi CLI: see moonshotai/kimi-cli",
    },
    Adapter {
        id: "opencode",
        name: "OpenCode",
        bin: "opencode",
        // Bare `opencode` launches the TUI (its default command); the ACP stdio server
        // is the `acp` subcommand. Needs `opencode auth login` once to be usable.
        acp_command: "opencode acp",
        model_env: None,
        install_hint: "install OpenCode: https://opencode.ai",
    },
    Adapter {
        id: "qwen",
        name: "Qwen Code",
        bin: "qwen",
        acp_command: "qwen --experimental-acp",
        model_env: None,
        install_hint: "install Qwen Code: npm i -g @qwen-code/qwen-code",
    },
];

/// Look up an adapter by its stable id (e.g. "claude-code").
pub fn find(id: &str) -> Option<&'static Adapter> {
    ADAPTERS.iter().find(|a| a.id == id)
}

/// The user's login-shell `PATH`, resolved once. A GUI app launched from Finder/Dock
/// inherits a minimal `PATH` (`/usr/bin:/bin:…`), so CLIs installed via Homebrew,
/// npm-global, nvm, or `~/.local/bin` aren't visible. We ask the login shell for its
/// `PATH` and use it for both detection and spawning the adapter. Falls back to the
/// process `PATH`.
fn user_path() -> &'static std::ffi::OsString {
    static CACHE: std::sync::OnceLock<std::ffi::OsString> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| {
        resolve_login_path().unwrap_or_else(|| std::env::var_os("PATH").unwrap_or_default())
    })
}

/// The resolved login-shell `PATH` as a `String`, for injecting into a spawned
/// adapter's environment so it (and `npx`/`node`) resolve the same way detection does.
pub fn user_path_string() -> String {
    user_path().to_string_lossy().into_owned()
}

#[cfg(unix)]
fn resolve_login_path() -> Option<std::ffi::OsString> {
    use std::process::{Command, Stdio};
    // Interactive login shell so it sources the user's profile/rc (where PATH is set).
    // stdin/stderr are detached so an rc file can't block on a prompt or spew noise.
    let shell = std::env::var_os("SHELL").unwrap_or_else(|| "/bin/zsh".into());
    let out = Command::new(shell)
        .args(["-ilc", "printf '%s' \"$PATH\""])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&out.stdout);
    let path = path.trim();
    (!path.is_empty()).then(|| std::ffi::OsString::from(path))
}

#[cfg(not(unix))]
fn resolve_login_path() -> Option<std::ffi::OsString> {
    None
}

/// Best-effort: is `bin` resolvable on the user's `PATH`? Probe only — we never
/// execute the binary here (no side effects, no auth prompts).
pub fn on_path(bin: &str) -> bool {
    std::env::split_paths(user_path()).any(|dir| {
        let candidate = dir.join(bin);
        candidate.is_file()
            || candidate.with_extension("exe").is_file()
            || candidate.with_extension("cmd").is_file()
    })
}

/// The picker list: every adapter, marked detected, with an install hint when not.
pub fn list() -> Vec<AgentInfo> {
    ADAPTERS
        .iter()
        .map(|a| {
            let detected = on_path(a.bin);
            AgentInfo {
                id: a.id.to_string(),
                name: a.name.to_string(),
                detected,
                install_hint: if detected {
                    None
                } else {
                    Some(a.install_hint.to_string())
                },
            }
        })
        .collect()
}
