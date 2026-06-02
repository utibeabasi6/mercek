use tauri::ipc::Channel;
use tauri::State;

use crate::agent::adapters;
use crate::agent::session::{AgentSink, MockAcpSession};
use crate::commands::profiles::use_mock;
use crate::domain::{AgentIntent, AgentInfo, AgentSessionUpdate, Scope};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// List connectable agent harnesses with best-effort PATH detection (spec §7).
/// Read-only and side-effect-free — it probes `PATH`, it launches nothing.
#[tauri::command]
pub fn agent_list() -> AppResult<Vec<AgentInfo>> {
    Ok(adapters::list())
}

/// Forwards a turn's output to the webview: display updates on one channel,
/// UI intents (navigate / propose) on another — the streaming analogue of the
/// log tail (`mercek.md` §12.1). Send failures are ignored: a closed channel
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

/// Connect a harness. Live ACP wiring is the next slice; for now the scripted
/// mock connects under `MERCEK_MOCK=1` (mirrors the app's mock convention).
#[tauri::command]
pub async fn agent_connect(state: State<'_, AppState>, agent_id: String) -> AppResult<()> {
    let _ = agent_id;
    if !use_mock() {
        return Err(AppError::internal(
            "live ACP connection not yet implemented — set MERCEK_MOCK=1 to try the scripted agent",
        ));
    }
    let scope = state
        .store
        .get_scopes()
        .ok()
        .and_then(|s| s.into_iter().next())
        .unwrap_or(Scope {
            profile: "prod".into(),
            region: "us-east-1".into(),
        });
    *state.agent.lock().await = Some(Box::new(MockAcpSession::new(scope)));
    Ok(())
}

/// Drive one user turn, streaming updates/intents to the given channels.
#[tauri::command]
pub async fn agent_prompt(
    state: State<'_, AppState>,
    text: String,
    updates: Channel<AgentSessionUpdate>,
    intents: Channel<AgentIntent>,
) -> AppResult<String> {
    let mut guard = state.agent.lock().await;
    let session = guard
        .as_mut()
        .ok_or_else(|| AppError::internal("no agent connected"))?;
    let sink = ChannelSink { updates, intents };
    session.prompt(&text, &sink).await
}

#[tauri::command]
pub async fn agent_cancel(state: State<'_, AppState>) -> AppResult<()> {
    if let Some(session) = state.agent.lock().await.as_mut() {
        session.cancel().await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn agent_disconnect(state: State<'_, AppState>) -> AppResult<()> {
    *state.agent.lock().await = None;
    Ok(())
}
