use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ScalingTarget {
    pub resource_id: String,
    pub service_namespace: String,
    pub scalable_dimension: String,
    pub min_capacity: u32,
    pub max_capacity: u32,
    pub role_arn: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ScalingPolicy {
    pub name: String,
    pub policy_arn: String,
    pub kind: String,
    pub resource_id: String,
    pub scalable_dimension: String,
    pub predefined_metric: Option<String>,
    pub target_value: Option<f64>,
    pub scale_in_cooldown: Option<i32>,
    pub scale_out_cooldown: Option<i32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ScalingView {
    pub targets: Vec<ScalingTarget>,
    pub policies: Vec<ScalingPolicy>,
}
