use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::domain::Scope;

/// A coding-agent harness the user can connect over ACP (agent-panel spec §7).
/// Detection is best-effort (binary on `PATH`); installation and auth are the
/// harness's own concern — Mercek stores no model credentials.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub detected: bool,
    /// Shown when not detected — how to get the harness / its ACP adapter.
    pub install_hint: Option<String>,
}

/// A draft mutation the agent surfaces for the human to confirm (spec §5.1).
/// Non-executing: emitting one only opens the existing prefilled diff+confirm
/// dialog — the mutation fires when the human clicks confirm, never the agent.
/// The union is closed to shapes Mercek already has a safe confirm dialog for;
/// `runTask`/`registerRevision` are intentionally excluded until 5c.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum ProposedAction {
    #[serde(rename_all = "camelCase")]
    Scale {
        scope: Scope,
        cluster: String,
        service: String,
        #[ts(rename = "desiredCount")]
        desired_count: u32,
    },
    #[serde(rename_all = "camelCase")]
    UpdateService {
        scope: Scope,
        cluster: String,
        service: String,
        #[ts(rename = "taskDefinition")]
        task_definition: Option<String>,
        #[ts(rename = "minimumHealthyPercent")]
        minimum_healthy_percent: Option<i32>,
        #[ts(rename = "maximumPercent")]
        maximum_percent: Option<i32>,
    },
    #[serde(rename_all = "camelCase")]
    ForceDeploy {
        scope: Scope,
        cluster: String,
        service: String,
    },
    #[serde(rename_all = "camelCase")]
    StopTask {
        scope: Scope,
        cluster: String,
        #[ts(rename = "taskArn")]
        task_arn: String,
        reason: Option<String>,
    },
}

/// Which kind of detail screen a `navigate` intent targets (spec §6).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum NavigateTarget {
    Cluster,
    Service,
    Task,
}

/// "Take me there." Resolved by `agent/navigate.rs` and emitted on the navigate
/// channel; the shell turns it into the matching tab via `openTab` (spec §6).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub struct NavigateIntent {
    pub scope: Scope,
    pub target: NavigateTarget,
    /// Cluster name; `cluster/service` for a service; task ARN for a task.
    pub key: String,
    /// Initial sub-tab, e.g. `deployments` / `events` / `metrics`.
    pub section: Option<String>,
    /// Element to scroll to / highlight (deployment id, task arn).
    pub focus_id: Option<String>,
}

/// A UI effect the agent asked for, carried to the shell on the intent channel
/// (spec §5.1, §6). `navigate` opens/focuses a tab; `propose` opens the existing
/// prefilled diff+confirm dialog. Neither touches AWS — only the human's confirm
/// click does.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum AgentIntent {
    Navigate { intent: NavigateIntent },
    Propose { action: ProposedAction },
}

/// Lifecycle of a single agent tool call, as shown on its chat card.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum ToolCallStatus {
    Pending,
    Ok,
    /// Refused by the read-only guard (spec §4.3).
    Blocked,
    Failed,
}

/// One streamed update from an agent turn, carried to the panel over a channel
/// (the streaming analogue of logs/metrics, `mercek.md` §12.1). Tool-call args
/// and summaries are already redacted of secret-shaped values (`mercek.md` §15).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "camelCase")]
#[ts(export, export_to = "../../src/types/generated/")]
pub enum AgentSessionUpdate {
    MessageChunk {
        text: String,
    },
    ThoughtChunk {
        text: String,
    },
    ToolCall {
        id: String,
        tool: String,
        args: String,
        status: ToolCallStatus,
    },
    ToolResult {
        id: String,
        status: ToolCallStatus,
        summary: Option<String>,
    },
    /// Turn finished normally.
    #[serde(rename_all = "camelCase")]
    Done {
        #[ts(rename = "stopReason")]
        stop_reason: String,
    },
    /// Harness/protocol failure (not an AWS error).
    Error {
        message: String,
    },
}
