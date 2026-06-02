use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::common::{Attachment, Attribute, Tag};

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Resource {
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub double_value: Option<f64>,
    pub long_value: Option<i32>,
    pub integer_value: Option<i32>,
    pub string_set_value: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct VersionInfo {
    pub agent_version: Option<String>,
    pub agent_hash: Option<String>,
    pub docker_version: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct InstanceHealthCheckResult {
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub status: Option<String>,
    pub last_updated: Option<String>,
    pub last_status_change: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ContainerInstanceHealthStatus {
    pub overall_status: Option<String>,
    pub details: Vec<InstanceHealthCheckResult>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ContainerInstance {
    pub arn: String,
    pub cluster: String,
    pub ec2_instance_id: Option<String>,
    pub capacity_provider_name: Option<String>,
    pub status: String,
    pub status_reason: Option<String>,
    pub agent_connected: bool,
    pub agent_update_status: Option<String>,
    pub running_tasks_count: u32,
    pub pending_tasks_count: u32,
    pub version: i32,
    pub version_info: Option<VersionInfo>,
    pub registered_at: Option<String>,
    pub registered_resources: Vec<Resource>,
    pub remaining_resources: Vec<Resource>,
    pub health_status: Option<ContainerInstanceHealthStatus>,
    pub attributes: Vec<Attribute>,
    pub attachments: Vec<Attachment>,
    pub tags: Vec<Tag>,
}
