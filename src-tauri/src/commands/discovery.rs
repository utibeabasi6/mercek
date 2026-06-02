use std::sync::Arc;

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::discovery::{cluster_resources as fetch_cluster_resources, discover_clusters};
use crate::domain::{ClusterResources, ResourceGraph, ScopeDiscovery, Scope, TaskDefinition};
use crate::error::AppResult;
use crate::resources::ecs::{EcsApi, MockEcs};
use crate::state::AppState;

async fn ecs_api(
    state: &AppState,
    scope: &Scope,
) -> AppResult<(Arc<dyn EcsApi>, Option<String>)> {
    if use_mock() {
        let mock = MockEcs::new(scope);
        let account = mock.account_id();
        Ok((Arc::new(mock), account))
    } else {
        let clients = state.pool.get(scope).await?;
        Ok((clients.ecs.clone(), clients.account_id.clone()))
    }
}

async fn discover_one(state: &AppState, scope: Scope) -> AppResult<ResourceGraph> {
    let (api, account) = ecs_api(state, &scope).await?;
    let graph = discover_clusters(api, scope, account).await?;
    if let Err(err) = state.store.save_snapshot(&graph) {
        tracing::warn!(error = %err, "failed to persist cluster snapshot");
    }
    Ok(graph)
}

#[tauri::command]
pub async fn discover(state: State<'_, AppState>, scope: Scope) -> AppResult<ResourceGraph> {
    discover_one(state.inner(), scope).await
}

#[tauri::command]
pub async fn discover_activated(state: State<'_, AppState>) -> AppResult<Vec<ScopeDiscovery>> {
    let scopes = state.store.get_scopes()?;
    let mut out = Vec::new();
    for scope in scopes {
        match discover_one(state.inner(), scope.clone()).await {
            Ok(graph) => out.push(ScopeDiscovery {
                scope,
                graph: Some(graph),
                error: None,
                stale: false,
            }),
            Err(err) => {
                tracing::warn!(
                    profile = %scope.profile,
                    region = %scope.region,
                    error = %err,
                    "cluster discovery failed; surfacing error + snapshot"
                );
                let snapshot = state.store.load_snapshot(&scope).ok().flatten();
                out.push(ScopeDiscovery {
                    scope,
                    stale: snapshot.is_some(),
                    graph: snapshot,
                    error: Some(err),
                });
            }
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn snapshot_activated(state: State<'_, AppState>) -> AppResult<Vec<ResourceGraph>> {
    let scopes = state.store.get_scopes()?;
    let mut out = Vec::new();
    for scope in scopes {
        if let Some(graph) = state.store.load_snapshot(&scope)? {
            out.push(graph);
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn cluster_resources(
    state: State<'_, AppState>,
    scope: Scope,
    cluster: String,
) -> AppResult<ClusterResources> {
    let (api, _) = ecs_api(state.inner(), &scope).await?;
    fetch_cluster_resources(api, cluster).await
}

#[tauri::command]
pub async fn task_definition(
    state: State<'_, AppState>,
    scope: Scope,
    arn: String,
) -> AppResult<TaskDefinition> {
    let (api, _) = ecs_api(state.inner(), &scope).await?;
    api.describe_task_definition(&arn).await
}
