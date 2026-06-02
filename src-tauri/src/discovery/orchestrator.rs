use std::sync::Arc;

use crate::domain::{ClusterResources, ResourceGraph, Scope};
use crate::error::AppResult;
use crate::resources::ecs::map::now_iso;
use crate::resources::ecs::EcsApi;

/// Shallow discovery: clusters + capacity providers only, so the tree paints
/// immediately. Services/tasks/container-instances load per-cluster on demand.
pub async fn discover_clusters(
    api: Arc<dyn EcsApi>,
    scope: Scope,
    account_id: Option<String>,
) -> AppResult<ResourceGraph> {
    let cluster_arns = api.list_clusters().await?;
    let clusters = api.describe_clusters(&cluster_arns).await?;
    let capacity_providers = api.describe_capacity_providers().await.unwrap_or_default();

    Ok(ResourceGraph {
        scope,
        account_id,
        fetched_at: now_iso(),
        clusters,
        capacity_providers,
        services: Vec::new(),
        tasks: Vec::new(),
        container_instances: Vec::new(),
        task_definitions: Vec::new(),
    })
}

/// Lazy per-cluster fetch: services, tasks, and container instances for one cluster.
pub async fn cluster_resources(
    api: Arc<dyn EcsApi>,
    cluster: String,
) -> AppResult<ClusterResources> {
    let service_arns = api.list_services(&cluster).await?;
    let services = api.describe_services(&cluster, &service_arns).await?;
    let task_arns = api.list_tasks(&cluster).await?;
    let tasks = api.describe_tasks(&cluster, &task_arns).await?;
    let ci_arns = api.list_container_instances(&cluster).await?;
    let container_instances = api.describe_container_instances(&cluster, &ci_arns).await?;

    Ok(ClusterResources {
        fetched_at: now_iso(),
        services,
        tasks,
        container_instances,
    })
}
