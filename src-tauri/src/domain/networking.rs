use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Networking {
    pub eni_id: Option<String>,
    pub private_ip: Option<String>,
    pub public_ip: Option<String>,
    pub subnet: Option<String>,
    pub vpc: Option<String>,
    pub security_groups: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct SecurityGroupRef {
    pub id: String,
    pub name: Option<String>,
}

/// Resolved EC2 network-interface detail (DescribeNetworkInterfaces), fetched
/// lazily on the task networking panel to enrich the ECS attachment.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct EniDetail {
    pub eni_id: String,
    pub status: Option<String>,
    pub interface_type: Option<String>,
    pub description: Option<String>,
    pub private_ip: Option<String>,
    pub public_ip: Option<String>,
    pub subnet_id: Option<String>,
    pub vpc_id: Option<String>,
    pub availability_zone: Option<String>,
    pub security_groups: Vec<SecurityGroupRef>,
}
