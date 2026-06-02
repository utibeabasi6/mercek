use std::sync::Arc;

use tauri::State;

use crate::commands::profiles::use_mock;
use crate::discovery::{cluster_resources as fetch_cluster_resources, discover_clusters};
use crate::domain::{ClusterResources, ResourceGraph, ScopeDiscovery, Scope, TaskDefinition};
use crate::error::AppResult;
use crate::resources::ecs::{EcsApi, MockEcs};
use crate::state::AppState;

async fn ecs_api(state: &AppState, scope: &Scope) -> AppResult<Arc<dyn EcsApi>> {
    if use_mock() {
        Ok(Arc::new(MockEcs::new(scope)))
    } else {
        Ok(state.pool.get(scope).await?.ecs.clone())
    }
}

async fn discover_one(state: &AppState, scope: Scope) -> AppResult<ResourceGraph> {
    let api = ecs_api(state, &scope).await?;
    let graph = discover_clusters(api, scope).await?;
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
    let st = state.inner();

    // Fan out across activated scopes concurrently (multi-account speed).
    let results = futures::future::join_all(scopes.into_iter().map(|scope| async move {
        let result = discover_one(st, scope.clone()).await;
        (scope, result)
    }))
    .await;

    let mut out = Vec::new();
    for (scope, result) in results {
        match result {
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
                let snapshot = st.store.load_snapshot(&scope).ok().flatten();
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
    let api = ecs_api(state.inner(), &scope).await?;
    fetch_cluster_resources(api, cluster).await
}

#[tauri::command]
pub async fn task_definition(
    state: State<'_, AppState>,
    scope: Scope,
    arn: String,
) -> AppResult<TaskDefinition> {
    let api = ecs_api(state.inner(), &scope).await?;
    api.describe_task_definition(&arn).await
}

#[tauri::command]
pub async fn list_task_definitions(
    state: State<'_, AppState>,
    scope: Scope,
    family: String,
) -> AppResult<Vec<String>> {
    let api = ecs_api(state.inner(), &scope).await?;
    api.list_task_definitions(&family).await
}

#[tauri::command]
pub async fn list_task_def_families(
    state: State<'_, AppState>,
    scope: Scope,
) -> AppResult<Vec<String>> {
    let api = ecs_api(state.inner(), &scope).await?;
    api.list_task_def_families().await
}
