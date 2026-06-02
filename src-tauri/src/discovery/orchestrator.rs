use std::sync::Arc;

use crate::domain::{ClusterResources, ResourceGraph, Scope};
use crate::error::AppResult;
use crate::resources::ecs::map::now_iso;
use crate::resources::ecs::EcsApi;

/// Account id is embedded in every ECS ARN (`arn:aws:ecs:region:ACCOUNT:...`),
/// so we read it from a cluster ARN instead of an STS round-trip.
fn account_from_arn(arn: &str) -> Option<String> {
    arn.split(':').nth(4).filter(|s| !s.is_empty()).map(str::to_string)
}

/// Shallow discovery: clusters + capacity providers only, so the tree paints
/// immediately. Services/tasks/container-instances load per-cluster on demand.
pub async fn discover_clusters(api: Arc<dyn EcsApi>, scope: Scope) -> AppResult<ResourceGraph> {
    let cluster_arns = api.list_clusters().await?;
    // Cluster describe and capacity providers are independent — fetch concurrently.
    let (clusters, capacity_providers) =
        tokio::join!(api.describe_clusters(&cluster_arns), api.describe_capacity_providers());
    let clusters = clusters?;
    let capacity_providers = capacity_providers.unwrap_or_default();
    let account_id = clusters.first().and_then(|c| account_from_arn(&c.arn));

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

/// Lazy per-cluster fetch: services, tasks, and container instances for one cluster,
/// all fetched concurrently.
pub async fn cluster_resources(
    api: Arc<dyn EcsApi>,
    cluster: String,
) -> AppResult<ClusterResources> {
    let (services, tasks, container_instances) = tokio::try_join!(
        async {
            let arns = api.list_services(&cluster).await?;
            api.describe_services(&cluster, &arns).await
        },
        async {
            let arns = api.list_tasks(&cluster).await?;
            api.describe_tasks(&cluster, &arns).await
        },
        async {
            let arns = api.list_container_instances(&cluster).await?;
            api.describe_container_instances(&cluster, &arns).await
        },
    )?;

    Ok(ClusterResources {
        fetched_at: now_iso(),
        services,
        tasks,
        container_instances,
    })
}
