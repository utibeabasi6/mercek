use tauri::State;

use crate::domain::{ScalingView, Scope, Service, TargetHealth};
use crate::error::AppResult;
use crate::resources::ecs::mutate;
use crate::state::AppState;

/// Scale a service's desired count. Write path — always real AWS, never mocked.
#[tauri::command]
pub async fn scale_service(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
    desired_count: u32,
) -> AppResult<Service> {
    let clients = state.pool.get(&scope).await?;
    mutate::update_service_desired(
        &clients.ecs_client,
        &scope.profile,
        &cluster,
        &service,
        desired_count as i32,
    )
    .await
}

/// Update a service's task-def revision and/or deployment config. Write path — real AWS only.
#[tauri::command]
pub async fn update_service(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
    task_definition: Option<String>,
    minimum_healthy_percent: Option<i32>,
    maximum_percent: Option<i32>,
) -> AppResult<Service> {
    let clients = state.pool.get(&scope).await?;
    mutate::update_service(
        &clients.ecs_client,
        &scope.profile,
        &cluster,
        &service,
        task_definition,
        minimum_healthy_percent,
        maximum_percent,
    )
    .await
}

/// Force a new (rolling) deployment of a service. Write path — real AWS only.
#[tauri::command]
pub async fn force_deploy(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
) -> AppResult<Service> {
    let clients = state.pool.get(&scope).await?;
    mutate::force_new_deployment(&clients.ecs_client, &scope.profile, &cluster, &service).await
}

/// Enable ECS Exec on a service and restart its tasks so the exec agent runs.
/// Write path — real AWS only.
#[tauri::command]
pub async fn enable_exec(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
) -> AppResult<Service> {
    let clients = state.pool.get(&scope).await?;
    mutate::enable_exec(&clients.ecs_client, &scope.profile, &cluster, &service).await
}

/// Deploy a new image to a service: register a new task-def revision with the image
/// swapped, then update the service to it. Write path — real AWS only.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn deploy_image(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
    base_arn: String,
    container_name: String,
    image: String,
) -> AppResult<Service> {
    let clients = state.pool.get(&scope).await?;
    mutate::deploy_image(
        &clients.ecs_client,
        &scope.profile,
        &cluster,
        &service,
        &base_arn,
        &container_name,
        &image,
    )
    .await
}

/// Create a new service in a cluster. Write path — real AWS only.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn create_service(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    name: String,
    task_definition: String,
    desired_count: u32,
    launch_type: String,
    subnets: Vec<String>,
    security_groups: Vec<String>,
    assign_public_ip: bool,
    target_group_arn: Option<String>,
    container_name: Option<String>,
    container_port: Option<u32>,
) -> AppResult<Service> {
    let clients = state.pool.get(&scope).await?;
    let load_balancer = match (target_group_arn, container_name, container_port) {
        (Some(tg), Some(cn), Some(port)) if !tg.is_empty() && !cn.is_empty() => {
            Some((tg, cn, port as i32))
        }
        _ => None,
    };
    mutate::create_service(
        &clients.ecs_client,
        &scope.profile,
        &cluster,
        &name,
        &task_definition,
        desired_count as i32,
        &launch_type,
        subnets,
        security_groups,
        assign_public_ip,
        load_balancer,
    )
    .await
}

#[tauri::command]
pub async fn target_health(
    state: State<'_, AppState>,
    scope: Scope,
    target_group_arn: String,
) -> AppResult<Vec<TargetHealth>> {
    let api = state.pool.get(&scope).await?.elb.clone();
    api.describe_target_health(&target_group_arn).await
}

#[tauri::command]
pub async fn scaling(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
    service: String,
) -> AppResult<ScalingView> {
    let resource_id = format!("service/{cluster}/{service}");
    let api = state.pool.get(&scope).await?.autoscaling.clone();
    api.scaling(&resource_id).await
}
