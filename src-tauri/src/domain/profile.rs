use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum ProfileKind {
    Static,
    Sso,
    AssumeRole,
    CredentialProcess,
    Mfa,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum ProfileStatus {
    Unresolved,
    Active,
    NeedsReauth,
    Forbidden,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct AwsProfile {
    pub name: String,
    pub kind: ProfileKind,
    pub region_default: Option<String>,
    pub account_id: Option<String>,
    pub status: ProfileStatus,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct Scope {
    pub profile: String,
    pub region: String,
}
