use std::sync::Arc;

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::domain::{ScalingView, Scope, Service, TargetHealth};
use crate::error::AppResult;
use crate::resources::autoscaling::{AutoscalingApi, MockAutoscaling};
use crate::resources::ecs::mutate;
use crate::resources::elb::{ElbApi, MockElb};
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

#[tauri::command]
pub async fn target_health(
    state: State<'_, AppState>,
    scope: Scope,
    target_group_arn: String,
) -> AppResult<Vec<TargetHealth>> {
    let api: Arc<dyn ElbApi> = if use_mock() {
        Arc::new(MockElb)
    } else {
        state.pool.get(&scope).await?.elb.clone()
    };
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
    let api: Arc<dyn AutoscalingApi> = if use_mock() {
        Arc::new(MockAutoscaling)
    } else {
        state.pool.get(&scope).await?.autoscaling.clone()
    };
    api.scaling(&resource_id).await
}
