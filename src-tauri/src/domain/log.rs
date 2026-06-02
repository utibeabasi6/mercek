use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct LogEvent {
    pub timestamp: String,
    pub message: String,
    pub ingestion_time: Option<String>,
    pub stream: Option<String>,
}
