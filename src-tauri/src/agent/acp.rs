//! Real ACP session: spawn the user's harness as a
//! subprocess, speak ACP over stdio via `agent-client-protocol`, and serve it ONLY
//! the read-only MCP tool server (`mcp::build_server`). No model keys, no AWS
//! credentials handed to the subprocess — it reaches ECS solely through our tools.
//!
//! The connection lives inside `connect_with`'s closure, so a session that survives
//! many prompts runs in a background task: prompts arrive over an mpsc channel and
//! the per-turn response/stop-reason is returned over a oneshot.

use std::str::FromStr;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use agent_client_protocol::schema::{
    CancelNotification, ContentBlock, ContentChunk, EnvVariable, McpServer, McpServerStdio,
    NewSessionRequest, PermissionOptionId, PermissionOptionKind, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome, SessionId,
    SessionModeId, SessionNotification, SessionUpdate, SetSessionModeRequest, ToolKind,
};
use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{
    on_receive_request, AcpAgent, Agent, ByteStreams, Client, ConnectionTo, SessionMessage,
};
use async_trait::async_trait;
use tokio::sync::{mpsc, oneshot};
use tokio_util::compat::{TokioAsyncReadCompatExt, TokioAsyncWriteCompatExt};

use crate::agent::mcp::SharedSink;
use crate::agent::session::{AcpSession, AgentSink};
use crate::domain::{AgentMode, AgentSessionUpdate, ConnectInfo, PermissionChoice, ToolCallStatus};
use crate::error::{AppError, AppResult};

/// Map one streamed ACP session update onto a panel update; returns true if it
/// surfaced something visible. Text answer + thinking + tool calls are surfaced;
/// other update kinds (plans, mode, usage) are ignored.
fn forward(sink: &Arc<dyn AgentSink>, update: SessionUpdate) -> bool {
    match update {
        SessionUpdate::AgentMessageChunk(ContentChunk {
            content: ContentBlock::Text(t),
            ..
        }) => {
            sink.update(AgentSessionUpdate::MessageChunk { text: t.text });
            true
        }
        SessionUpdate::AgentThoughtChunk(ContentChunk {
            content: ContentBlock::Text(t),
            ..
        }) => {
            sink.update(AgentSessionUpdate::ThoughtChunk { text: t.text });
            true
        }
        SessionUpdate::ToolCall(tc) => {
            sink.update(AgentSessionUpdate::ToolCall {
                id: format!("{:?}", tc.tool_call_id),
                tool: tc.title,
                args: tc.raw_input.map(|v| v.to_string()).unwrap_or_default(),
                status: ToolCallStatus::Pending,
            });
            true
        }
        _ => false,
    }
}

struct PromptMsg {
    text: String,
    sink: Arc<dyn AgentSink>,
    done: oneshot::Sender<AppResult<String>>,
}

/// Control messages routed into the live session task.
enum Cmd {
    Prompt(PromptMsg),
    SetMode {
        mode_id: String,
        done: oneshot::Sender<AppResult<()>>,
    },
}

pub struct SdkAcpSession {
    cmd_tx: mpsc::UnboundedSender<Cmd>,
    /// Connection + session id captured at ready, so `cancel` can interrupt a turn
    /// directly (the command channel is blocked while a turn streams).
    conn: ConnectionTo<Agent>,
    session_id: SessionId,
    /// The current turn's sink, shared with the MCP tool handlers so navigate /
    /// propose reach the live channel. Set before each prompt.
    current_sink: SharedSink,
    /// The harness's current ACP mode id (e.g. "default", "bypassPermissions"). The
    /// permission handler reads it to decide auto-approve / ask / deny; `set_mode`
    /// keeps it in sync.
    current_mode: Arc<StdMutex<Option<String>>>,
    /// Process-group id of the spawned harness (== leader pid; we put it in its own
    /// group). Lets the app SIGKILL the whole tree (npx + its node child) on
    /// disconnect/quit — see `agent::proc::kill_group`. 0 if the pid was unavailable.
    pgid: i32,
}

impl SdkAcpSession {
    /// The harness process group to signal on teardown (0 = nothing to kill).
    pub fn pgid(&self) -> i32 {
        self.pgid
    }
}

fn acp_to_app(e: agent_client_protocol::Error) -> AppError {
    AppError::internal(format!("agent: {e}"))
}

/// Env vars forwarded to the spawned `mercek --mcp` server: only what it needs to find
/// `~/.aws` and make AWS calls. Everything else (unrelated secrets in the launching
/// shell) is dropped so it can't leak into the child process.
fn forward_to_mcp(key: &str) -> bool {
    const EXACT: &[&str] = &[
        "HOME",
        "USERPROFILE",
        "PATH",
        "TMPDIR",
        "TMP",
        "TEMP",
        "LANG",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
    ];
    EXACT.contains(&key)
        || key.starts_with("AWS_")
        || key.starts_with("XDG_")
        || key.starts_with("LC_")
}

impl SdkAcpSession {
    /// Detect + connect the chosen harness, spawning the long-lived ACP task.
    /// `model` (if set + the harness exposes a model env var) is injected into the
    /// subprocess environment.
    pub async fn connect(
        agent_id: &str,
        model: Option<String>,
        permissions: Arc<StdMutex<HashMap<u32, oneshot::Sender<Option<String>>>>>,
        perm_seq: Arc<AtomicU32>,
    ) -> AppResult<(Self, ConnectInfo)> {
        let adapter = crate::agent::adapters::find(agent_id)
            .ok_or_else(|| AppError::internal(format!("unknown agent: {agent_id}")))?;
        if !crate::agent::adapters::on_path(adapter.bin) {
            return Err(AppError::internal(format!(
                "{} not found on PATH — {}",
                adapter.name, adapter.install_hint
            )));
        }
        // Parse the adapter command line (program, args, any NAME=value env prefix) with
        // the SDK's parser, then spawn it OURSELVES rather than letting the SDK do it: the
        // SDK spawns-and-hides the child and only SIGKILLs the *direct* process on drop,
        // which orphans npx's `node` grandchild and never runs at all on a GUI hard-exit.
        // Owning the spawn lets us put the harness in its own process group and kill the
        // whole tree on disconnect/quit (see `agent::proc`).
        let parsed = AcpAgent::from_str(adapter.acp_command).map_err(acp_to_app)?;
        let stdio = match parsed.into_server() {
            McpServer::Stdio(s) => s,
            _ => {
                return Err(AppError::internal(format!(
                    "{} adapter must be a stdio command",
                    adapter.name
                )))
            }
        };
        let (name, acp_cmd, hint) = (adapter.name, adapter.acp_command, adapter.install_hint);

        let mut cmd = tokio::process::Command::new(&stdio.command);
        cmd.args(&stdio.args);
        for ev in &stdio.env {
            cmd.env(&ev.name, &ev.value);
        }
        // A Finder/Dock launch inherits a stripped PATH, so the harness binary (npx,
        // claude, …) isn't on it; run with the user's login-shell PATH. Inject the model
        // preference under the harness's model env var when we know it.
        cmd.env("PATH", crate::agent::adapters::user_path_string());
        if let (Some(env_name), Some(m)) = (adapter.model_env, model.filter(|m| !m.is_empty())) {
            cmd.env(env_name, m);
        }
        cmd.stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        // Own process group (leader pid == pgid) so we can SIGKILL the whole tree; and
        // kill_on_drop as a backstop if this task is dropped while the runtime is alive.
        #[cfg(unix)]
        cmd.process_group(0);
        cmd.kill_on_drop(true);
        let mut child = cmd.spawn().map_err(|e| {
            AppError::internal(format!("couldn't start {name} (`{acp_cmd}`): {e} — {hint}"))
        })?;
        let pgid = child.id().map(|p| p as i32).unwrap_or(0);
        let child_stdin = child
            .stdin
            .take()
            .ok_or_else(|| AppError::internal("harness stdin unavailable"))?;
        let child_stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::internal("harness stdout unavailable"))?;
        // Drain the harness's stderr so its pipe can't fill and wedge the process; keep a
        // capped tail to enrich a "closed before ready" error (the SDK used to do this).
        let stderr_tail: Arc<StdMutex<String>> = Arc::new(StdMutex::new(String::new()));
        if let Some(err) = child.stderr.take() {
            let tail = stderr_tail.clone();
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::debug!(target: "agent_harness", "{line}");
                    if let Ok(mut t) = tail.lock() {
                        t.push_str(&line);
                        t.push('\n');
                        let extra = t.len().saturating_sub(8192);
                        if extra > 0 {
                            *t = t.split_off(extra);
                        }
                    }
                }
            });
        }
        let transport = ByteStreams::new(child_stdin.compat_write(), child_stdout.compat());
        let stderr_for_err = stderr_tail;

        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<Cmd>();
        let current_sink: SharedSink = Arc::new(StdMutex::new(None));
        let current_mode: Arc<StdMutex<Option<String>>> = Arc::new(StdMutex::new(None));
        // Clones moved into the session task's permission handler.
        let perm_sink = current_sink.clone();
        let perm_mode = current_mode.clone();
        let perm_map = permissions;
        let perm_seq2 = perm_seq;

        // The session task signals `Ok(ConnectInfo)` (with the harness's modes) once
        // the session is established; if the harness fails to spawn/initialize first,
        // the task reports that failure here so `connect` surfaces it immediately
        // instead of on the first prompt.
        type Ready = (ConnectInfo, ConnectionTo<Agent>, SessionId);
        let (ready_tx, ready_rx) = oneshot::channel::<AppResult<Ready>>();
        // Neutral working dir: the harness's built-in file/shell tools must NOT see
        // a code repo (it would answer from local files instead of our ECS tools).
        let cwd = std::env::temp_dir().join("mercek-agent");
        let _ = std::fs::create_dir_all(&cwd);
        // The harness spawns our read-only ECS tools by running this very binary as
        // `mercek --mcp` (see `lib.rs`), handed to it as a stdio MCP server below.
        let exe = std::env::current_exe().map_err(|e| {
            AppError::internal(format!("can't locate the mercek binary for the agent's tools: {e}"))
        })?;
        // The SDK spawns the MCP server with ONLY the env we pass. Forward an ALLOWLIST —
        // just what `mercek --mcp` needs to resolve `~/.aws` and make AWS calls (HOME,
        // PATH, AWS_*/XDG_*, proxy + TLS, locale) — rather than the whole environment, so
        // unrelated secrets in the launching shell (GITHUB_TOKEN, other API keys, …) don't
        // leak into a second process's env. (AWS creds in `AWS_*` are forwarded by design:
        // the child is our own read-only binary and needs them for env-based auth.)
        let mut mcp_env: Vec<EnvVariable> = std::env::vars()
            .filter(|(k, _)| forward_to_mcp(k))
            .map(|(k, v)| EnvVariable::new(k, v))
            .collect();
        // Where the subprocess sends navigate/propose intents back to this app, and
        // the token it must present so only our subprocess can drive the panel.
        mcp_env.push(EnvVariable::new(
            crate::agent::ipc::SOCK_ENV,
            crate::agent::ipc::socket_path().to_string_lossy().into_owned(),
        ));
        mcp_env.push(EnvVariable::new(
            crate::agent::ipc::TOKEN_ENV,
            crate::agent::ipc::token().to_string(),
        ));
        let ready_slot = Arc::new(StdMutex::new(Some(ready_tx)));
        let ready_in_closure = ready_slot.clone();

        tokio::spawn(async move {
            // Own the Child for the connection's whole lifetime: kill_on_drop SIGKILLs the
            // direct process if this task ends (a backstop to the group-kill on disconnect).
            let _harness_child = child;
            // NB: do NOT register a global `on_receive_notification` here — it would
            // swallow the session's own update notifications before they reach the
            // ActiveSession's stream, leaving every turn empty. The session captures
            // its notifications via `read_update` inside `run_until`.
            let run = Client
                .builder()
                .on_receive_request(
                    async move |req: RequestPermissionRequest, responder, _cx| {
                        // This prompt is for the HARNESS's OWN tools (file write/delete/shell);
                        // Mercek's read-only ECS tools never reach here. Honor the session
                        // mode: Bypass approves everything; reads/think/search auto-approve;
                        // "Accept Edits" auto-approves edits; otherwise a host-mutating tool
                        // (Edit/Delete/Move/Execute) is surfaced to the user, who decides.
                        let mode = perm_mode
                            .lock()
                            .ok()
                            .and_then(|g| g.clone())
                            .unwrap_or_default()
                            .to_lowercase();
                        let kind = req.tool_call.fields.kind;
                        // Decide ONLY from the tool kind, never the title: the title is
                        // free-form text the model controls, so keying off it (e.g. a
                        // `contains("mercek")` allowlist) would let a write tool titled to
                        // look like a read slip through. Auto-approve only the clearly-safe
                        // read kinds; anything else — file write / shell, or an unset/Other
                        // kind — is surfaced to the user.
                        let safe_read =
                            matches!(kind, Some(ToolKind::Read | ToolKind::Search | ToolKind::Think));
                        let is_reject = |k: &PermissionOptionKind| {
                            matches!(
                                k,
                                PermissionOptionKind::RejectOnce | PermissionOptionKind::RejectAlways
                            )
                        };
                        let is_once = |k: &PermissionOptionKind| {
                            matches!(
                                k,
                                PermissionOptionKind::RejectOnce | PermissionOptionKind::AllowOnce
                            )
                        };
                        let pick = |reject: bool| {
                            req.options
                                .iter()
                                .find(|o| is_reject(&o.kind) == reject && is_once(&o.kind))
                                .or_else(|| req.options.iter().find(|o| is_reject(&o.kind) == reject))
                                .map(|o| o.option_id.clone())
                        };
                        let auto_approve = mode.contains("bypass")
                            || safe_read
                            || (matches!(kind, Some(ToolKind::Edit)) && mode.contains("accept"));

                        let chosen: Option<PermissionOptionId> = if auto_approve {
                            pick(false)
                        } else if let Some(sink) = perm_sink.lock().ok().and_then(|g| g.clone()) {
                            // Ask the user via an inline card and await their reply.
                            let id = perm_seq2.fetch_add(1, Ordering::Relaxed);
                            let (tx, rx) = oneshot::channel::<Option<String>>();
                            if let Ok(mut m) = perm_map.lock() {
                                m.insert(id, tx);
                            }
                            sink.update(AgentSessionUpdate::PermissionRequest {
                                id,
                                title: req
                                    .tool_call
                                    .fields
                                    .title
                                    .clone()
                                    .unwrap_or_else(|| "use a tool".to_string()),
                                kind: kind.map(|k| format!("{k:?}").to_lowercase()),
                                options: req
                                    .options
                                    .iter()
                                    .map(|o| PermissionChoice {
                                        id: o.option_id.0.to_string(),
                                        label: o.name.clone(),
                                        allow: !is_reject(&o.kind),
                                    })
                                    .collect(),
                            });
                            let reply =
                                tokio::time::timeout(std::time::Duration::from_secs(300), rx).await;
                            if let Ok(mut m) = perm_map.lock() {
                                m.remove(&id);
                            }
                            match reply {
                                Ok(Ok(Some(s))) => req
                                    .options
                                    .iter()
                                    .find(|o| o.option_id.0.as_ref() == s.as_str())
                                    .map(|o| o.option_id.clone()),
                                _ => None, // timeout / dismissed → deny
                            }
                        } else {
                            // No live panel to ask → default-deny the mutation.
                            pick(true)
                        };

                        match chosen {
                            Some(id) => responder.respond(RequestPermissionResponse::new(
                                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(id)),
                            )),
                            None => responder.respond(RequestPermissionResponse::new(
                                RequestPermissionOutcome::Cancelled,
                            )),
                        }
                    },
                    on_receive_request!(),
                )
                .connect_with(transport, async move |cx| {
                    // Hand the harness our read-only ECS tools as a STDIO MCP server it
                    // spawns itself (`mercek --mcp`). The in-process MCP-over-ACP bridge
                    // registers as an Http server, which claude-code-acp does NOT honor
                    // (and `~/.claude.json` is ignored too — the adapter runs `claude`
                    // with strict MCP config). A Stdio spec in `session/new` is the path
                    // every ACP adapter supports. Trade-off: navigate/propose run in that
                    // out-of-process server with no UI sink, so they return their honest
                    // "needs the in-app panel" message rather than driving the UI.
                    let mut req = NewSessionRequest::new(cwd);
                    req.mcp_servers.push(McpServer::Stdio(
                        McpServerStdio::new("mercek-ecs-readonly", exe)
                            .args(vec!["--mcp".to_string()])
                            .env(mcp_env),
                    ));
                    let builder = cx.build_session_from(req).block_task();
                    builder
                        .run_until(async move |mut session| {
                            // Session is live: surface the harness's modes + signal ready
                            // with the connection/session id (used by `cancel`).
                            let info = session
                                .modes()
                                .as_ref()
                                .map(|m| ConnectInfo {
                                    current_mode: Some(m.current_mode_id.0.to_string()),
                                    modes: m
                                        .available_modes
                                        .iter()
                                        .map(|sm| AgentMode {
                                            id: sm.id.0.to_string(),
                                            name: sm.name.clone(),
                                            description: sm.description.clone(),
                                        })
                                        .collect(),
                                })
                                .unwrap_or_default();
                            if let Some(tx) =
                                ready_in_closure.lock().unwrap_or_else(|e| e.into_inner()).take()
                            {
                                let _ = tx.send(Ok((info, session.connection(), session.session_id().clone())));
                            }
                            while let Some(cmd) = cmd_rx.recv().await {
                                let msg = match cmd {
                                    Cmd::SetMode { mode_id, done } => {
                                        let req = SetSessionModeRequest::new(
                                            session.session_id().clone(),
                                            SessionModeId::new(mode_id),
                                        );
                                        let res = session
                                            .connection()
                                            .send_request_to(Agent, req)
                                            .block_task()
                                            .await;
                                        let _ = done.send(res.map(|_| ()).map_err(acp_to_app));
                                        continue;
                                    }
                                    Cmd::Prompt(msg) => msg,
                                };
                                let mut turn_err = None;
                                let got_content = Arc::new(AtomicBool::new(false));
                                if let Err(e) = session.send_prompt(&msg.text) {
                                    turn_err = Some(e);
                                } else {
                                    // Stream the turn: forward every update as it arrives,
                                    // until the agent signals the turn is over.
                                    loop {
                                        match session.read_update().await {
                                            Ok(SessionMessage::StopReason(_)) => break,
                                            Ok(SessionMessage::SessionMessage(dispatch)) => {
                                                let sink = msg.sink.clone();
                                                let got = got_content.clone();
                                                let _ = MatchDispatch::new(dispatch)
                                                    .if_notification(
                                                        async move |notif: SessionNotification| {
                                                            if forward(&sink, notif.update) {
                                                                got.store(true, Ordering::Relaxed);
                                                            }
                                                            Ok(())
                                                        },
                                                    )
                                                    .await
                                                    .otherwise_ignore();
                                            }
                                            Ok(_) => {}
                                            Err(e) => {
                                                turn_err = Some(e);
                                                break;
                                            }
                                        }
                                    }
                                }
                                match turn_err {
                                    None => {
                                        if !got_content.load(Ordering::Relaxed) {
                                            msg.sink.update(AgentSessionUpdate::MessageChunk {
                                                text: "(The harness ended the turn without output. \
                                                       It may need to be authenticated — run the \
                                                       agent's CLI once in a terminal to sign in — \
                                                       or try rephrasing.)"
                                                    .into(),
                                            });
                                        }
                                        msg.sink.update(AgentSessionUpdate::Done {
                                            stop_reason: "end_turn".into(),
                                        });
                                        let _ = msg.done.send(Ok("end_turn".to_string()));
                                    }
                                    Some(e) => {
                                        msg.sink.update(AgentSessionUpdate::Error {
                                            message: e.to_string(),
                                        });
                                        let _ = msg.done.send(Err(acp_to_app(e)));
                                    }
                                }
                            }
                            Ok(())
                        })
                        .await
                })
                .await;
            if let Err(e) = run {
                // If we never signaled ready, the harness failed to start — report it.
                if let Some(tx) = ready_slot.lock().unwrap_or_else(|e| e.into_inner()).take() {
                    let _ = tx.send(Err(AppError::internal(format!(
                        "couldn't start {name} (`{acp_cmd}`): {e} — {hint}"
                    ))));
                } else {
                    tracing::warn!(error = %e, "ACP session ended");
                }
            }
        });

        // Any failure to reach "ready" leaves a half-started harness whose task still
        // owns the Child — kill the whole group so a hung/slow harness can't linger.
        let tail = || {
            stderr_for_err
                .lock()
                .ok()
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .map(|t| format!(" — last output: {t}"))
                .unwrap_or_default()
        };
        match tokio::time::timeout(std::time::Duration::from_secs(20), ready_rx).await {
            Ok(Ok(Ok((info, conn, session_id)))) => {
                if let Ok(mut g) = current_mode.lock() {
                    *g = info.current_mode.clone();
                }
                Ok((
                    Self {
                        cmd_tx,
                        conn,
                        session_id,
                        current_sink,
                        current_mode,
                        pgid,
                    },
                    info,
                ))
            }
            Ok(Ok(Err(e))) => {
                crate::agent::proc::kill_group(pgid);
                Err(e)
            }
            Ok(Err(_)) => {
                crate::agent::proc::kill_group(pgid);
                Err(AppError::internal(format!(
                    "{name} closed the connection before it was ready — is `{acp_cmd}` installed? {hint}{}",
                    tail()
                )))
            }
            Err(_) => {
                crate::agent::proc::kill_group(pgid);
                Err(AppError::internal(format!(
                    "timed out starting {name} (`{acp_cmd}`) — {hint}{}",
                    tail()
                )))
            }
        }
    }
}

#[async_trait]
impl AcpSession for SdkAcpSession {
    async fn prompt(&mut self, text: &str, sink: Arc<dyn AgentSink>) -> AppResult<String> {
        // Point the MCP tool handlers (navigate/propose) at this turn's sink.
        *self.current_sink.lock().unwrap_or_else(|e| e.into_inner()) = Some(sink.clone());
        let (done, done_rx) = oneshot::channel();
        self.cmd_tx
            .send(Cmd::Prompt(PromptMsg {
                text: text.to_string(),
                sink,
                done,
            }))
            .map_err(|_| AppError::internal("agent session is not running"))?;
        done_rx
            .await
            .map_err(|_| AppError::internal("agent session dropped the turn"))?
    }

    async fn set_mode(&mut self, mode_id: String) -> AppResult<()> {
        if let Ok(mut g) = self.current_mode.lock() {
            *g = Some(mode_id.clone());
        }
        let (done, done_rx) = oneshot::channel();
        self.cmd_tx
            .send(Cmd::SetMode { mode_id, done })
            .map_err(|_| AppError::internal("agent session is not running"))?;
        done_rx
            .await
            .map_err(|_| AppError::internal("agent session dropped the request"))?
    }
}

impl SdkAcpSession {
    /// A handle that interrupts the current turn (ACP `session/cancel`) without
    /// taking the session mutex (a running prompt holds it). The harness ends the
    /// turn, which the read loop observes as a StopReason.
    pub fn canceller(&self) -> Arc<dyn Fn() -> AppResult<()> + Send + Sync> {
        let conn = self.conn.clone();
        let session_id = self.session_id.clone();
        Arc::new(move || {
            conn.send_notification(CancelNotification::new(session_id.clone()))
                .map_err(acp_to_app)
        })
    }
}
