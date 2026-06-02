use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::common::{Attachment, Attribute, EphemeralStorage, Tag};
use super::networking::Networking;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct NetworkBinding {
    pub bind_ip: Option<String>,
    pub container_port: Option<u32>,
    pub host_port: Option<u32>,
    pub protocol: Option<String>,
    pub container_port_range: Option<String>,
    pub host_port_range: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ContainerNetworkInterface {
    pub attachment_id: Option<String>,
    pub private_ipv4_address: Option<String>,
    pub ipv6_address: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ManagedAgent {
    pub name: Option<String>,
    pub last_status: Option<String>,
    pub reason: Option<String>,
    pub last_started_at: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Container {
    pub container_arn: Option<String>,
    pub name: String,
    pub image: String,
    pub image_digest: Option<String>,
    pub runtime_id: Option<String>,
    pub last_status: String,
    pub health: String,
    pub exit_code: Option<i32>,
    pub reason: Option<String>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub memory_reservation: Option<String>,
    pub gpu_ids: Vec<String>,
    pub network_bindings: Vec<NetworkBinding>,
    pub network_interfaces: Vec<ContainerNetworkInterface>,
    pub managed_agents: Vec<ManagedAgent>,
    pub log_group: Option<String>,
    pub log_stream: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct TaskOverride {
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub task_role_arn: Option<String>,
    pub execution_role_arn: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Task {
    pub arn: String,
    pub task_def_arn: String,
    pub cluster: String,
    pub group: String,
    pub service: Option<String>,
    pub last_status: String,
    pub desired_status: String,
    pub health: String,
    pub connectivity: Option<String>,
    pub connectivity_at: Option<String>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub availability_zone: Option<String>,
    pub capacity_provider_name: Option<String>,
    pub launch_type: Option<String>,
    pub platform_version: Option<String>,
    pub platform_family: Option<String>,
    pub container_instance_arn: Option<String>,
    pub started_by: Option<String>,
    pub version: i32,
    pub enable_execute_command: bool,
    pub created_at: Option<String>,
    pub started_at: Option<String>,
    pub pull_started_at: Option<String>,
    pub pull_stopped_at: Option<String>,
    pub execution_stopped_at: Option<String>,
    pub stopping_at: Option<String>,
    pub stopped_at: Option<String>,
    pub stop_code: Option<String>,
    pub stopped_reason: Option<String>,
    pub overrides: Option<TaskOverride>,
    pub ephemeral_storage: Option<EphemeralStorage>,
    pub attachments: Vec<Attachment>,
    pub attributes: Vec<Attribute>,
    pub tags: Vec<Tag>,
    pub containers: Vec<Container>,
    pub networking: Option<Networking>,
}
