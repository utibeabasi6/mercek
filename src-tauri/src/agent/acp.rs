//! Real ACP session: spawn the user's harness as a
//! subprocess, speak ACP over stdio via `agent-client-protocol`, and serve it ONLY
//! the read-only MCP tool server (`mcp::build_server`). No model keys, no AWS
//! credentials handed to the subprocess — it reaches ECS solely through our tools.
//!
//! The connection lives inside `connect_with`'s closure, so a session that survives
//! many prompts runs in a background task: prompts arrive over an mpsc channel and
//! the per-turn response/stop-reason is returned over a oneshot.

use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

use agent_client_protocol::schema::{
    CancelNotification, ContentBlock, ContentChunk, EnvVariable, McpServer, McpServerStdio,
    NewSessionRequest, RequestPermissionOutcome, RequestPermissionRequest,
    RequestPermissionResponse, SelectedPermissionOutcome, SessionId, SessionModeId,
    SessionNotification, SessionUpdate, SetSessionModeRequest,
};
use agent_client_protocol::util::MatchDispatch;
use agent_client_protocol::{
    on_receive_request, AcpAgent, Agent, Client, ConnectionTo, SessionMessage,
};
use async_trait::async_trait;
use tokio::sync::{mpsc, oneshot};

use crate::agent::mcp::SharedSink;
use crate::agent::session::{AcpSession, AgentSink};
use crate::domain::{AgentMode, AgentSessionUpdate, ConnectInfo, ToolCallStatus};
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
}

fn acp_to_app(e: agent_client_protocol::Error) -> AppError {
    AppError::internal(format!("agent: {e}"))
}

impl SdkAcpSession {
    /// Detect + connect the chosen harness, spawning the long-lived ACP task.
    /// `model` (if set + the harness exposes a model env var) is injected into the
    /// subprocess environment.
    pub async fn connect(
        agent_id: &str,
        model: Option<String>,
    ) -> AppResult<(Self, ConnectInfo)> {
        let adapter = crate::agent::adapters::find(agent_id)
            .ok_or_else(|| AppError::internal(format!("unknown agent: {agent_id}")))?;
        if !crate::agent::adapters::on_path(adapter.bin) {
            return Err(AppError::internal(format!(
                "{} not found on PATH — {}",
                adapter.name, adapter.install_hint
            )));
        }
        let mut agent = AcpAgent::from_str(adapter.acp_command).map_err(acp_to_app)?;
        // A Finder/Dock launch inherits a stripped PATH, so the harness binary (npx,
        // claude, …) isn't found when the adapter is spawned. Run it with the user's
        // login-shell PATH, and inject the model preference as the harness's model env
        // var when we know it. (from_str always yields a Stdio transport for our
        // command-line adapters; a non-stdio transport simply can't carry env.)
        match agent.into_server() {
            McpServer::Stdio(mut stdio) => {
                stdio
                    .env
                    .push(EnvVariable::new("PATH", crate::agent::adapters::user_path_string()));
                if let (Some(env_name), Some(m)) =
                    (adapter.model_env, model.filter(|m| !m.is_empty()))
                {
                    stdio.env.push(EnvVariable::new(env_name, m));
                }
                agent = AcpAgent::new(McpServer::Stdio(stdio));
            }
            other => agent = AcpAgent::new(other),
        }
        let (name, acp_cmd, hint) = (adapter.name, adapter.acp_command, adapter.install_hint);

        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<Cmd>();
        let current_sink: SharedSink = Arc::new(StdMutex::new(None));

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
        // The SDK spawns the MCP server with ONLY the env we pass — an empty env
        // means it can't find `$HOME/.aws`, so `list_scopes` comes back empty and the
        // agent concludes "no profiles." Forward our full environment so the spawned
        // `mercek --mcp` reads AWS (profiles, region, SSO cache) exactly as we do.
        let mut mcp_env: Vec<EnvVariable> = std::env::vars()
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
            // NB: do NOT register a global `on_receive_notification` here — it would
            // swallow the session's own update notifications before they reach the
            // ActiveSession's stream, leaving every turn empty. The session captures
            // its notifications via `read_update` inside `run_until`.
            let run = Client
                .builder()
                .on_receive_request(
                    async move |req: RequestPermissionRequest, responder, _cx| {
                        // Read-only surface: approve the agent's permission prompts.
                        match req.options.first().map(|o| o.option_id.clone()) {
                            Some(id) => responder.respond(RequestPermissionResponse::new(
                                RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                                    id,
                                )),
                            )),
                            None => responder.respond(RequestPermissionResponse::new(
                                RequestPermissionOutcome::Cancelled,
                            )),
                        }
                    },
                    on_receive_request!(),
                )
                .connect_with(agent, async move |cx| {
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

        match tokio::time::timeout(std::time::Duration::from_secs(20), ready_rx).await {
            Ok(Ok(Ok((info, conn, session_id)))) => Ok((
                Self {
                    cmd_tx,
                    conn,
                    session_id,
                    current_sink,
                },
                info,
            )),
            Ok(Ok(Err(e))) => Err(e),
            Ok(Err(_)) => Err(AppError::internal(format!(
                "{name} closed the connection before it was ready — is `{acp_cmd}` installed? {hint}"
            ))),
            Err(_) => Err(AppError::internal(format!(
                "timed out starting {name} (`{acp_cmd}`) — {hint}"
            ))),
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
