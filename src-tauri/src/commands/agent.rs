use tauri::ipc::Channel;
use tauri::State;

use crate::agent::acp::SdkAcpSession;
use crate::agent::adapters;
use crate::agent::session::AgentSink;
use crate::db::store::AgentThreadMeta;
use crate::domain::{AgentIntent, AgentInfo, AgentSessionUpdate, ConnectInfo};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// List connectable agent harnesses with best-effort PATH detection.
/// Read-only and side-effect-free — it probes `PATH`, it launches nothing.
#[tauri::command]
pub fn agent_list() -> AppResult<Vec<AgentInfo>> {
    Ok(adapters::list())
}

/// Ensure `~/.claude.json`'s `mcpServers` has a `mercek` stdio entry pointing at
/// this binary (`mercek --mcp`) — exactly how Pencil/other MCP servers register.
/// Best-effort + idempotent; preserves all other config and won't clobber a file
/// it can't parse as a JSON object.
/// Remove any `mercek` MCP entry an earlier build wrote to `~/.claude.json`. The
/// in-app agent now receives our tools via the ACP `session/new` stdio spec (see
/// `acp.rs`); claude-code-acp ALSO loads `~/.claude.json` (its `settingSources`
/// include "user"), so a leftover entry would register the same tools a SECOND
/// time under the name `mercek`, giving the agent a confusing duplicate set. We
/// only ever touch our own key, never clobber the rest of the file, and skip
/// entirely if the config is missing/unparseable. Best-effort.
fn unregister_mcp_server() {
    let Some(home) = std::env::var_os("HOME") else {
        return;
    };
    let path = std::path::Path::new(&home).join(".claude.json");
    let Ok(s) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(mut root) = serde_json::from_str::<serde_json::Value>(&s) else {
        return; // don't risk rewriting a config we can't parse
    };
    let removed = root
        .as_object_mut()
        .and_then(|o| o.get_mut("mcpServers"))
        .and_then(|m| m.as_object_mut())
        .map(|servers| servers.remove("mercek").is_some())
        .unwrap_or(false);
    if !removed {
        return; // nothing of ours to clean up
    }
    if let Ok(out) = serde_json::to_string_pretty(&root) {
        // Atomic-ish write so a crash can't truncate the user's config.
        let tmp = path.with_extension("json.mercek-tmp");
        if std::fs::write(&tmp, out).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

/// Forwards a turn's output to the webview: display updates on one channel,
/// UI intents (navigate / propose) on another — the streaming analogue of the
/// log tail. Send failures are ignored: a closed channel
/// just means the panel went away mid-turn.
struct ChannelSink {
    updates: Channel<AgentSessionUpdate>,
    intents: Channel<AgentIntent>,
}

impl AgentSink for ChannelSink {
    fn update(&self, update: AgentSessionUpdate) {
        let _ = self.updates.send(update);
    }
    fn intent(&self, intent: AgentIntent) {
        let _ = self.intents.send(intent);
    }
}

/// Connect the chosen harness over ACP. The app always uses a real session
/// (`SdkAcpSession`); the scripted mock is test-only (the `mock` feature).
#[tauri::command]
pub async fn agent_connect(
    state: State<'_, AppState>,
    agent_id: String,
    model: Option<String>,
) -> AppResult<ConnectInfo> {
    // Tools reach the in-app agent via the ACP session's stdio MCP spec (see
    // `acp.rs`). Strip any stale `~/.claude.json` copy first so claude-code-acp
    // (which also reads user config) doesn't load the same tools a second time.
    unregister_mcp_server();
    let (session, info) = SdkAcpSession::connect(
        &agent_id,
        model,
        state.agent_permissions.clone(),
        state.agent_perm_seq.clone(),
    )
    .await?;
    if let Ok(mut c) = state.agent_canceller.lock() {
        *c = Some(session.canceller());
    }
    *state.agent.lock().await = Some(Box::new(session));
    Ok(info)
}

/// Switch the connected harness's operating mode (ACP session mode).
#[tauri::command]
pub async fn agent_set_mode(state: State<'_, AppState>, mode_id: String) -> AppResult<()> {
    let mut guard = state.agent.lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| AppError::internal("no agent connected"))?;
    session.set_mode(mode_id).await
}

/// Reply to a harness permission prompt the panel surfaced (the agent's `Default`/
/// `Accept Edits` modes ask before the harness writes files or runs commands).
/// `option_id` is the chosen option's id, `None` denies. Resolves the request the ACP
/// permission handler is awaiting.
#[tauri::command]
pub fn agent_respond_permission(
    state: State<'_, AppState>,
    id: u32,
    option_id: Option<String>,
) -> AppResult<()> {
    if let Ok(mut m) = state.agent_permissions.lock() {
        if let Some(tx) = m.remove(&id) {
            let _ = tx.send(option_id);
        }
    }
    Ok(())
}

/// Drive one user turn, streaming updates/intents to the given channels. `context`
/// (the screen the user is on) is prepended to what the agent sees so it can resolve
/// "this service" / "prod"; the user's chat bubble shows only their raw text.
#[tauri::command]
pub async fn agent_prompt(
    state: State<'_, AppState>,
    text: String,
    context: Option<String>,
    updates: Channel<AgentSessionUpdate>,
    intents: Channel<AgentIntent>,
) -> AppResult<String> {
    let full = match context.as_deref() {
        Some(c) if !c.trim().is_empty() => format!("Current view: {c}\n\n{text}"),
        _ => text,
    };
    let mut guard = state.agent.lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| AppError::internal("no agent connected"))?;
    let sink: std::sync::Arc<dyn AgentSink> = std::sync::Arc::new(ChannelSink { updates, intents });
    // Expose this turn's sink to the IPC listener so navigate/propose emitted by the
    // out-of-process tools reach the live channel; cleared when the turn ends.
    if let Ok(mut slot) = state.agent_intent_sink.lock() {
        *slot = Some(sink.clone());
    }
    let result = session.prompt(&full, sink).await;
    if let Ok(mut slot) = state.agent_intent_sink.lock() {
        *slot = None;
    }
    result
}

/// Interrupt the current turn. Uses the canceller (not the agent mutex, which a
/// running prompt holds) so it works mid-turn.
#[tauri::command]
pub async fn agent_cancel(state: State<'_, AppState>) -> AppResult<()> {
    let canceller = state.agent_canceller.lock().ok().and_then(|c| c.clone());
    if let Some(cancel) = canceller {
        cancel()?;
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_disconnect(state: State<'_, AppState>) -> AppResult<()> {
    if let Ok(mut c) = state.agent_canceller.lock() {
        *c = None;
    }
    *state.agent.lock().await = None;
    Ok(())
}

// Chat history is persisted in redb (the same store as scopes/snapshots) so it
// survives restarts. Transcript items are stored opaquely — the UI owns their shape.

#[tauri::command]
pub fn agent_threads_list(state: State<'_, AppState>) -> AppResult<Vec<AgentThreadMeta>> {
    state.store.list_agent_threads()
}

#[tauri::command]
pub fn agent_thread_load(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<serde_json::Value>> {
    state.store.load_agent_thread(&id)
}

#[tauri::command]
pub fn agent_thread_save(
    state: State<'_, AppState>,
    id: String,
    title: String,
    created_at: f64,
    updated_at: f64,
    items: serde_json::Value,
) -> AppResult<Vec<AgentThreadMeta>> {
    state.store.save_agent_thread(
        AgentThreadMeta { id, title, created_at, updated_at },
        &items,
    )
}

#[tauri::command]
pub fn agent_thread_delete(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<AgentThreadMeta>> {
    state.store.delete_agent_thread(&id)
}
