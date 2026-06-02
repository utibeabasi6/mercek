use std::sync::Arc;

use mercek_lib::discovery::{cluster_resources, discover_clusters};
use mercek_lib::domain::Scope;
use mercek_lib::resources::ecs::{EcsApi, MockEcs};

#[tokio::test]
async fn shallow_discovery_then_lazy_cluster_resources() {
    let scope = Scope {
        profile: "prod".into(),
        region: "us-east-1".into(),
    };
    let mock = MockEcs::new(&scope);
    let account = mock.account_id();
    let api: Arc<dyn EcsApi> = Arc::new(mock);

    // Shallow pass: clusters + capacity providers only, no services/tasks.
    let graph = discover_clusters(api.clone(), scope, account)
        .await
        .expect("shallow discovery succeeds");
    assert_eq!(graph.clusters.len(), 2, "frontend + backend clusters");
    assert!(!graph.capacity_providers.is_empty());
    assert!(graph.services.is_empty(), "services are lazy, not in shallow pass");
    assert!(graph.tasks.is_empty(), "tasks are lazy, not in shallow pass");
    assert_eq!(graph.account_id.as_deref(), Some("111111111111"));

    // Lazy per-cluster: resources load on demand.
    let mut total_services = 0;
    let mut total_tasks = 0;
    for cluster in &graph.clusters {
        let resources = cluster_resources(api.clone(), cluster.name.clone())
            .await
            .expect("cluster resources load");
        assert!(
            resources.services.iter().all(|s| s.cluster == cluster.name),
            "resources scoped to the requested cluster"
        );
        total_services += resources.services.len();
        total_tasks += resources.tasks.len();
    }
    assert_eq!(total_services, 5, "web, gateway, api, worker, scheduler");
    assert!(total_tasks >= 15, "running tasks across services");
}
