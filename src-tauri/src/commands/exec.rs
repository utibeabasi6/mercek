use tauri::ipc::Channel;
use tauri::State;

use crate::domain::Scope;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::streaming::exec::spawn_exec;

/// Open an ECS Exec interactive shell into a running task's container, streaming PTY
/// output over `on_output`. Returns a session id for write/resize/stop. Write path —
/// real AWS only; needs ECS Exec enabled on the task and `session-manager-plugin`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn exec_start(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    task: String,
    container: String,
    command: Option<String>,
    rows: u16,
    cols: u16,
    on_output: Channel<String>,
) -> AppResult<u64> {
    let path = crate::agent::adapters::user_path_string();
    let cmd = command.filter(|c| !c.is_empty()).unwrap_or_else(|| "/bin/sh".to_string());
    let session = tokio::task::spawn_blocking(move || {
        spawn_exec(
            &scope.profile,
            &scope.region,
            &cluster,
            &task,
            &container,
            &cmd,
            &path,
            rows,
            cols,
            on_output,
        )
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))??;
    Ok(state.register_exec(session))
}

#[tauri::command]
pub fn exec_write(state: State<'_, AppState>, session: u64, data: String) -> AppResult<()> {
    state.exec_write(session, data.as_bytes())
}

#[tauri::command]
pub fn exec_resize(state: State<'_, AppState>, session: u64, rows: u16, cols: u16) -> AppResult<()> {
    state.exec_resize(session, rows, cols)
}

#[tauri::command]
pub fn exec_stop(state: State<'_, AppState>, session: u64) -> AppResult<()> {
    state.exec_stop(session);
    Ok(())
}
