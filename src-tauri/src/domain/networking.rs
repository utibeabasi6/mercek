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

/// A VPC in the region — an option in the run-task / create-service network pickers.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Vpc {
    pub id: String,
    pub cidr: Option<String>,
    pub is_default: bool,
    pub name: Option<String>,
}

/// A subnet, grouped under its VPC in the network pickers.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Subnet {
    pub id: String,
    pub vpc_id: String,
    pub availability_zone: Option<String>,
    pub cidr: Option<String>,
    pub name: Option<String>,
}

/// A security group, grouped under its VPC.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct SecurityGroup {
    pub id: String,
    pub vpc_id: String,
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Every VPC / subnet / security group in a region — the awsvpc network choices for the
/// run-task and create-service forms. Fetched once when a form opens; the UI filters the
/// subnets and groups by the selected VPC.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct NetworkOptions {
    pub vpcs: Vec<Vpc>,
    pub subnets: Vec<Subnet>,
    pub security_groups: Vec<SecurityGroup>,
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
