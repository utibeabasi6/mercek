use tauri::State;

use crate::domain::{Cluster, Scope};
use crate::error::AppResult;
use crate::resources::ecs::mutate;
use crate::state::AppState;

/// Create a new ECS cluster. Write path — real AWS only.
#[tauri::command]
pub async fn create_cluster(
    state: State<'_, AppState>,
    scope: Scope,
    name: String,
    container_insights: bool,
) -> AppResult<Cluster> {
    let clients = state.pool.get(&scope).await?;
    mutate::create_cluster(&clients.ecs_client, &scope.profile, &name, container_insights).await
}
