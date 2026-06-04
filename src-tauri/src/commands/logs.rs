use tauri::ipc::Channel;
use tauri::State;

use crate::domain::{LogEvent, Scope};
use crate::error::AppResult;
use crate::state::AppState;
use crate::streaming::logs::{run_filter_tail, run_tail};

#[tauri::command]
pub async fn start_log_tail(
    state: State<'_, AppState>,
    scope: Scope,
    log_group: String,
    log_stream: String,
    on_event: Channel<LogEvent>,
) -> AppResult<u64> {
    let api = state.pool.get(&scope).await?.logs.clone();
    let handle = tokio::spawn(async move {
        if let Err(err) = run_tail(api, log_group, log_stream, on_event).await {
            tracing::warn!(error = %err, "log tail ended with error");
        }
    });
    Ok(state.register_tail(handle.abort_handle()))
}

/// Tail every stream in a log group (all tasks of a service) interleaved.
#[tauri::command]
pub async fn start_log_tail_group(
    state: State<'_, AppState>,
    scope: Scope,
    log_group: String,
    filter_pattern: Option<String>,
    on_event: Channel<LogEvent>,
) -> AppResult<u64> {
    let api = state.pool.get(&scope).await?.logs.clone();
    let handle = tokio::spawn(async move {
        if let Err(err) = run_filter_tail(api, log_group, filter_pattern, on_event).await {
            tracing::warn!(error = %err, "log group tail ended with error");
        }
    });
    Ok(state.register_tail(handle.abort_handle()))
}

#[tauri::command]
pub fn stop_log_tail(state: State<'_, AppState>, tail_id: u64) -> AppResult<()> {
    state.stop_tail(tail_id);
    Ok(())
}
