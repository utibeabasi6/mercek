use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::cluster::CapacityProviderStrategyItem;
use super::common::{NetworkConfiguration, PlacementConstraint, PlacementStrategy, Tag};

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DeploymentCircuitBreaker {
    pub enable: bool,
    pub rollback: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DeploymentAlarms {
    pub alarm_names: Vec<String>,
    pub enable: bool,
    pub rollback: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DeploymentConfiguration {
    pub maximum_percent: Option<i32>,
    pub minimum_healthy_percent: Option<i32>,
    pub deployment_circuit_breaker: Option<DeploymentCircuitBreaker>,
    pub alarms: Option<DeploymentAlarms>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DeploymentController {
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Deployment {
    pub id: String,
    pub status: String,
    pub task_def: String,
    pub desired: u32,
    pub pending: u32,
    pub running: u32,
    pub failed_tasks: u32,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub launch_type: Option<String>,
    pub platform_version: Option<String>,
    pub platform_family: Option<String>,
    pub capacity_provider_strategy: Vec<CapacityProviderStrategyItem>,
    pub network_configuration: Option<NetworkConfiguration>,
    pub rollout_state: String,
    pub rollout_state_reason: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ServiceEvent {
    pub id: String,
    pub created_at: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct LoadBalancerRef {
    pub target_group_arn: Option<String>,
    pub load_balancer_name: Option<String>,
    pub container_name: String,
    pub container_port: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ServiceRegistryRef {
    pub registry_arn: String,
    pub container_name: Option<String>,
    pub container_port: Option<u32>,
    pub port: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Service {
    pub arn: String,
    pub name: String,
    pub cluster: String,
    pub status: String,
    pub desired: u32,
    pub running: u32,
    pub pending: u32,
    pub launch_type: Option<String>,
    pub capacity_provider_strategy: Vec<CapacityProviderStrategyItem>,
    pub platform_version: Option<String>,
    pub platform_family: Option<String>,
    pub task_def_arn: String,
    pub scheduling_strategy: Option<String>,
    pub deployment_controller: Option<DeploymentController>,
    pub deployment_configuration: Option<DeploymentConfiguration>,
    pub deployments: Vec<Deployment>,
    pub role_arn: Option<String>,
    pub created_at: Option<String>,
    pub created_by: Option<String>,
    pub placement_constraints: Vec<PlacementConstraint>,
    pub placement_strategy: Vec<PlacementStrategy>,
    pub network_configuration: Option<NetworkConfiguration>,
    pub health_check_grace_period_seconds: Option<i32>,
    pub enable_ecs_managed_tags: bool,
    pub propagate_tags: Option<String>,
    pub enable_execute_command: bool,
    pub availability_zone_rebalancing: Option<String>,
    pub load_balancers: Vec<LoadBalancerRef>,
    pub registries: Vec<ServiceRegistryRef>,
    pub events: Vec<ServiceEvent>,
    pub tags: Vec<Tag>,
}
