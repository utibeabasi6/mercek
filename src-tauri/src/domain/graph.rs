use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::cluster::{CapacityProvider, Cluster};
use super::container_instance::ContainerInstance;
use super::profile::Scope;
use super::service::Service;
use super::task::Task;
use super::task_def::TaskDefinition;
use crate::error::AppError;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ResourceGraph {
    pub scope: Scope,
    pub account_id: Option<String>,
    pub fetched_at: String,
    pub clusters: Vec<Cluster>,
    pub capacity_providers: Vec<CapacityProvider>,
    pub services: Vec<Service>,
    pub tasks: Vec<Task>,
    pub container_instances: Vec<ContainerInstance>,
    pub task_definitions: Vec<TaskDefinition>,
}

/// Resources within a single cluster, fetched lazily when the cluster is opened.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ClusterResources {
    pub fetched_at: String,
    pub services: Vec<Service>,
    pub tasks: Vec<Task>,
    pub container_instances: Vec<ContainerInstance>,
}

/// Per-scope discovery outcome. `graph` is the best available data (fresh, or a
/// stale snapshot when the live fetch failed); `error` explains a failed fetch.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ScopeDiscovery {
    pub scope: Scope,
    pub graph: Option<ResourceGraph>,
    pub error: Option<AppError>,
    pub stale: bool,
}
