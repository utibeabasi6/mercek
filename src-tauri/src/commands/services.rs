use std::sync::Arc;

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::domain::{ScalingView, Scope, TargetHealth};
use crate::error::AppResult;
use crate::resources::autoscaling::{AutoscalingApi, MockAutoscaling};
use crate::resources::elb::{ElbApi, MockElb};
use crate::state::AppState;

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
