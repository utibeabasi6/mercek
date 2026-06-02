use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct TargetHealth {
    pub target_id: String,
    pub port: Option<u32>,
    pub availability_zone: Option<String>,
    pub state: String,
    pub reason: Option<String>,
    pub description: Option<String>,
}
