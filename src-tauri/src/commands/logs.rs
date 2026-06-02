use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;

use crate::commands::profiles::use_mock;
use crate::domain::{LogEvent, Scope};
use crate::error::AppResult;
use crate::resources::logs::{LogsApi, MockLogs};
use crate::state::AppState;
use crate::streaming::logs::run_tail;

#[tauri::command]
pub async fn start_log_tail(
    state: State<'_, AppState>,
    scope: Scope,
    log_group: String,
    log_stream: String,
    on_event: Channel<LogEvent>,
) -> AppResult<u64> {
    let api: Arc<dyn LogsApi> = if use_mock() {
        Arc::new(MockLogs)
    } else {
        state.pool.get(&scope).await?.logs.clone()
    };
    let handle = tokio::spawn(async move {
        if let Err(err) = run_tail(api, log_group, log_stream, on_event).await {
            tracing::warn!(error = %err, "log tail ended with error");
        }
    });
    Ok(state.register_tail(handle.abort_handle()))
}

#[tauri::command]
pub fn stop_log_tail(state: State<'_, AppState>, tail_id: u64) -> AppResult<()> {
    state.stop_tail(tail_id);
    Ok(())
}
