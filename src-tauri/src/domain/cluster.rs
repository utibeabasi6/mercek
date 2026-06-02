use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::common::{Attachment, KeyValuePair, Tag};

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct CapacityProviderStrategyItem {
    pub capacity_provider: String,
    pub weight: u32,
    pub base: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ManagedScaling {
    pub status: Option<String>,
    pub target_capacity: Option<u32>,
    pub minimum_scaling_step_size: Option<u32>,
    pub maximum_scaling_step_size: Option<u32>,
    pub instance_warmup_period: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct AutoScalingGroupProvider {
    pub auto_scaling_group_arn: String,
    pub managed_scaling: Option<ManagedScaling>,
    pub managed_termination_protection: Option<String>,
    pub managed_draining: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct CapacityProvider {
    pub arn: String,
    pub name: String,
    pub kind: String,
    pub status: String,
    pub auto_scaling_group_provider: Option<AutoScalingGroupProvider>,
    pub update_status: Option<String>,
    pub update_status_reason: Option<String>,
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ClusterStats {
    pub active_services: u32,
    pub running_tasks: u32,
    pub pending_tasks: u32,
    pub container_instances: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ClusterSettings {
    pub container_insights: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ExecuteCommandConfiguration {
    pub kms_key_id: Option<String>,
    pub logging: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ManagedStorageConfiguration {
    pub kms_key_id: Option<String>,
    pub fargate_ephemeral_storage_kms_key_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ClusterConfiguration {
    pub execute_command_configuration: Option<ExecuteCommandConfiguration>,
    pub managed_storage_configuration: Option<ManagedStorageConfiguration>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ClusterServiceConnectDefaults {
    pub namespace: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Cluster {
    pub arn: String,
    pub name: String,
    pub status: String,
    pub registered_container_instances_count: u32,
    pub running_tasks_count: u32,
    pub pending_tasks_count: u32,
    pub active_services_count: u32,
    pub statistics: Vec<KeyValuePair>,
    pub tags: Vec<Tag>,
    pub settings: ClusterSettings,
    pub configuration: Option<ClusterConfiguration>,
    pub capacity_providers: Vec<String>,
    pub default_strategy: Vec<CapacityProviderStrategyItem>,
    pub attachments: Vec<Attachment>,
    pub attachments_status: Option<String>,
    pub service_connect_defaults: Option<ClusterServiceConnectDefaults>,
    pub stats: ClusterStats,
}
