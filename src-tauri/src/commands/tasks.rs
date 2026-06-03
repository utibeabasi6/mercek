use tauri::State;

use crate::domain::{EniDetail, EnvVar, Scope, SecretRef, Task, TaskDefinition};
use crate::error::AppResult;
use crate::resources::ecs::mutate;
use crate::resources::ecs::mutate::ContainerEdit;
use crate::state::AppState;

/// Register a new task-definition revision from a base revision. Write path — real AWS only.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn register_revision(
    state: State<'_, AppState>,
    scope: Scope,
    base_arn: String,
    container_name: String,
    image: Option<String>,
    env: Vec<EnvVar>,
    secrets: Vec<SecretRef>,
    cpu: Option<String>,
    memory: Option<String>,
) -> AppResult<TaskDefinition> {
    let clients = state.pool.get(&scope).await?;
    let edit = ContainerEdit {
        container_name,
        image,
        env: env.into_iter().map(|e| (e.key, e.value)).collect(),
        secrets: secrets.into_iter().map(|s| (s.key, s.source_arn)).collect(),
    };
    mutate::register_revision(&clients.ecs_client, &scope.profile, &base_arn, edit, cpu, memory).await
}

#[tauri::command]
pub async fn describe_eni(
    state: State<'_, AppState>,
    scope: Scope,
    eni_id: String,
) -> AppResult<EniDetail> {
    let api = state.pool.get(&scope).await?.ec2.clone();
    api.describe_eni(&eni_id).await
}

/// Run a one-off task. Write path — real AWS only.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn run_task(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    task_definition: String,
    count: u32,
    launch_type: String,
    subnets: Vec<String>,
    security_groups: Vec<String>,
    assign_public_ip: bool,
) -> AppResult<Vec<Task>> {
    let clients = state.pool.get(&scope).await?;
    mutate::run_task(
        &clients.ecs_client,
        &scope.profile,
        &cluster,
        &task_definition,
        count as i32,
        &launch_type,
        subnets,
        security_groups,
        assign_public_ip,
    )
    .await
}

/// Stop a running task. Write path — real AWS only.
#[tauri::command]
pub async fn stop_task(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    task: String,
    reason: Option<String>,
) -> AppResult<Task> {
    let clients = state.pool.get(&scope).await?;
    mutate::stop_task(&clients.ecs_client, &scope.profile, &cluster, &task, reason).await
}
