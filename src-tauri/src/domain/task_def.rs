use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::common::{EphemeralStorage, KeyValuePair, PlacementConstraint, RuntimePlatform};

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct EnvironmentFile {
    pub value: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct SecretRef {
    pub key: String,
    pub source_arn: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct RepositoryCredentials {
    pub credentials_parameter: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct PortMapping {
    pub container_port: Option<u32>,
    pub host_port: Option<u32>,
    pub protocol: Option<String>,
    pub name: Option<String>,
    pub app_protocol: Option<String>,
    pub container_port_range: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct MountPoint {
    pub source_volume: Option<String>,
    pub container_path: Option<String>,
    pub read_only: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct VolumeFrom {
    pub source_container: Option<String>,
    pub read_only: Option<bool>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ContainerDependency {
    pub container_name: String,
    pub condition: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ExtraHost {
    pub hostname: String,
    pub ip_address: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Ulimit {
    pub name: String,
    pub soft_limit: i32,
    pub hard_limit: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct HealthCheck {
    pub command: Vec<String>,
    pub interval: Option<i32>,
    pub timeout: Option<i32>,
    pub retries: Option<i32>,
    pub start_period: Option<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct SystemControl {
    pub namespace: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ResourceRequirement {
    pub value: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct FirelensConfiguration {
    #[serde(rename = "type")]
    pub kind: String,
    pub options: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct RestartPolicy {
    pub enabled: bool,
    pub ignored_exit_codes: Vec<i32>,
    pub restart_attempt_period: Option<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct KernelCapabilities {
    pub add: Vec<String>,
    pub drop: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct LinuxParameters {
    pub capabilities: Option<KernelCapabilities>,
    pub init_process_enabled: Option<bool>,
    pub shared_memory_size: Option<i32>,
    pub swappiness: Option<i32>,
    pub max_swap: Option<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct LogConfig {
    pub log_driver: String,
    pub log_group: Option<String>,
    pub options: HashMap<String, String>,
    pub secret_options: Vec<SecretRef>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct DockerVolumeConfiguration {
    pub scope: Option<String>,
    pub autoprovision: Option<bool>,
    pub driver: Option<String>,
    pub driver_opts: HashMap<String, String>,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct EfsVolumeConfiguration {
    pub file_system_id: String,
    pub root_directory: Option<String>,
    pub transit_encryption: Option<String>,
    pub transit_encryption_port: Option<i32>,
    pub access_point_id: Option<String>,
    pub iam: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Volume {
    pub name: String,
    pub host_path: Option<String>,
    pub configured_at_launch: Option<bool>,
    pub docker_volume_configuration: Option<DockerVolumeConfiguration>,
    pub efs_volume_configuration: Option<EfsVolumeConfiguration>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ContainerDef {
    pub name: String,
    pub image: String,
    pub repository_credentials: Option<RepositoryCredentials>,
    pub cpu: u32,
    pub memory: Option<u32>,
    pub memory_reservation: Option<u32>,
    pub essential: bool,
    pub links: Vec<String>,
    pub entry_point: Vec<String>,
    pub command: Vec<String>,
    pub env: Vec<EnvVar>,
    pub environment_files: Vec<EnvironmentFile>,
    pub secrets: Vec<SecretRef>,
    pub port_mappings: Vec<PortMapping>,
    pub mount_points: Vec<MountPoint>,
    pub volumes_from: Vec<VolumeFrom>,
    pub depends_on: Vec<ContainerDependency>,
    pub start_timeout: Option<u32>,
    pub stop_timeout: Option<u32>,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub working_directory: Option<String>,
    pub disable_networking: Option<bool>,
    pub privileged: Option<bool>,
    pub readonly_root_filesystem: Option<bool>,
    pub interactive: Option<bool>,
    pub pseudo_terminal: Option<bool>,
    pub dns_servers: Vec<String>,
    pub dns_search_domains: Vec<String>,
    pub extra_hosts: Vec<ExtraHost>,
    pub docker_security_options: Vec<String>,
    pub docker_labels: HashMap<String, String>,
    pub ulimits: Vec<Ulimit>,
    pub system_controls: Vec<SystemControl>,
    pub resource_requirements: Vec<ResourceRequirement>,
    pub linux_parameters: Option<LinuxParameters>,
    pub health_check: Option<HealthCheck>,
    pub firelens_configuration: Option<FirelensConfiguration>,
    pub restart_policy: Option<RestartPolicy>,
    pub credential_specs: Vec<String>,
    pub log_config: Option<LogConfig>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ProxyConfiguration {
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub container_name: String,
    pub properties: Vec<KeyValuePair>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct InferenceAccelerator {
    pub device_name: String,
    pub device_type: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct TaskDefinition {
    pub arn: String,
    pub family: String,
    pub revision: u32,
    pub status: String,
    pub task_role_arn: Option<String>,
    pub execution_role_arn: Option<String>,
    pub network_mode: Option<String>,
    pub cpu: Option<String>,
    pub memory: Option<String>,
    pub pid_mode: Option<String>,
    pub ipc_mode: Option<String>,
    pub requires_compatibilities: Vec<String>,
    pub compatibilities: Vec<String>,
    pub runtime_platform: Option<RuntimePlatform>,
    pub proxy_configuration: Option<ProxyConfiguration>,
    pub ephemeral_storage: Option<EphemeralStorage>,
    pub enable_fault_injection: Option<bool>,
    pub placement_constraints: Vec<PlacementConstraint>,
    pub inference_accelerators: Vec<InferenceAccelerator>,
    pub volumes: Vec<Volume>,
    pub container_defs: Vec<ContainerDef>,
}
