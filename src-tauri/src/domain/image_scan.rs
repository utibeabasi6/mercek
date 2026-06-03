use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// ECR vulnerability-scan summary for one image — severity counts from its latest
/// scan, linked back to the task definition's container image.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct ImageScan {
    pub repository: String,
    /// The tag or digest queried.
    pub reference: String,
    pub registry_id: Option<String>,
    /// COMPLETE / IN_PROGRESS / FAILED / ACTIVE / FINDINGS_UNAVAILABLE / …
    pub scan_status: Option<String>,
    pub critical: u32,
    pub high: u32,
    pub medium: u32,
    pub low: u32,
    pub informational: u32,
    pub undefined: u32,
    pub scanned_at: Option<String>,
}
