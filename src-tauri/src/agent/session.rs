//! The ACP session seam (agent-panel spec §3).
//!
//! The real impl wraps `agent-client-protocol` (spawn the harness subprocess,
//! speak ACP over stdio) plus the read-only MCP tool server. We keep that behind
//! a trait — exactly like the `EcsApi`/`MockEcs` read seam — so the command layer
//! and tests don't depend on a live harness. `MockAcpSession` scripts a turn that
//! exercises the whole loop: a read, a navigate, a proposal, and a blocked write.

use async_trait::async_trait;
use serde_json::json;

use crate::agent::bridge::{classify, ToolClass};
use crate::agent::dispatch::{self, ToolOutcome};
use crate::domain::{AgentIntent, AgentSessionUpdate, Scope, ToolCallStatus};
use crate::error::AppResult;

/// Where a turn's output goes: display updates + UI intents. The command layer
/// implements this over Tauri channels; tests implement a recorder.
pub trait AgentSink: Send + Sync {
    fn update(&self, update: AgentSessionUpdate);
    fn intent(&self, intent: AgentIntent);
}

/// One live connection to a coding harness. `prompt` drives a single user turn,
/// streaming updates/intents through `sink`, and returns the ACP stop reason.
#[async_trait]
pub trait AcpSession: Send + Sync {
    async fn prompt(&mut self, text: &str, sink: &dyn AgentSink) -> AppResult<String>;
    async fn cancel(&mut self) -> AppResult<()>;
}

/// Scripted, offline session for `MERCEK_MOCK=1` (and the loop test). It does not
/// reach AWS or any subprocess; it demonstrates the read-only contract end to end.
pub struct MockAcpSession {
    scope: Scope,
}

impl MockAcpSession {
    pub fn new(scope: Scope) -> Self {
        Self { scope }
    }

    /// Emit a tool-call card and route it: reads return canned summaries, UI
    /// intents fire on the sink, denied writes show a "blocked" card.
    fn tool_call(&self, sink: &dyn AgentSink, id: &str, tool: &str, args: serde_json::Value, summary: &str) {
        sink.update(AgentSessionUpdate::ToolCall {
            id: id.into(),
            tool: tool.into(),
            args: args.to_string(),
            status: ToolCallStatus::Pending,
        });
        match dispatch::route(tool, &args) {
            Ok(ToolOutcome::Intent(intent)) => {
                sink.intent(intent);
                sink.update(AgentSessionUpdate::ToolResult {
                    id: id.into(),
                    status: ToolCallStatus::Ok,
                    summary: Some(summary.into()),
                });
            }
            Ok(ToolOutcome::Read(_)) => sink.update(AgentSessionUpdate::ToolResult {
                id: id.into(),
                status: ToolCallStatus::Ok,
                summary: Some(summary.into()),
            }),
            Ok(ToolOutcome::Blocked) | Err(_) => sink.update(AgentSessionUpdate::ToolResult {
                id: id.into(),
                status: ToolCallStatus::Blocked,
                summary: Some("blocked — the agent panel is read-only".into()),
            }),
        }
    }
}

#[async_trait]
impl AcpSession for MockAcpSession {
    async fn prompt(&mut self, text: &str, sink: &dyn AgentSink) -> AppResult<String> {
        let s = &self.scope;
        sink.update(AgentSessionUpdate::MessageChunk {
            text: format!("(mock agent) you asked: “{text}”.\n"),
        });
        sink.update(AgentSessionUpdate::ThoughtChunk {
            text: "reading the active scope to find the latest deployment…".into(),
        });

        self.tool_call(
            sink,
            "t1",
            "get_cluster_resources",
            json!({ "scope": s, "cluster": "backend" }),
            "backend: api is mid-deployment (running 5/6)",
        );

        sink.update(AgentSessionUpdate::MessageChunk {
            text: "`api` in `backend` has an in-progress rollout. Taking you there.\n".into(),
        });
        self.tool_call(
            sink,
            "t2",
            "navigate",
            json!({ "scope": s, "target": "service", "key": "backend/api", "section": "deployments" }),
            "opened service api → deployments",
        );

        sink.update(AgentSessionUpdate::MessageChunk {
            text: "It's been pending a while — you may want more capacity. Here's a change to confirm:\n"
                .into(),
        });
        self.tool_call(
            sink,
            "t3",
            "propose_action",
            json!({ "kind": "scale", "scope": s, "cluster": "backend", "service": "api", "desiredCount": 8 }),
            "proposed: scale api 6 → 8 (you confirm)",
        );

        // Prove the guard: even if the model tries a write, it is refused.
        self.tool_call(
            sink,
            "t4",
            "scale_service",
            json!({ "scope": s, "cluster": "backend", "service": "api", "desiredCount": 8 }),
            "",
        );
        debug_assert_eq!(classify("scale_service"), ToolClass::Denied);

        sink.update(AgentSessionUpdate::Done { stop_reason: "end_turn".into() });
        Ok("end_turn".into())
    }

    async fn cancel(&mut self) -> AppResult<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Recorder {
        updates: Mutex<Vec<AgentSessionUpdate>>,
        intents: Mutex<Vec<AgentIntent>>,
    }
    impl AgentSink for Recorder {
        fn update(&self, u: AgentSessionUpdate) {
            self.updates.lock().unwrap().push(u);
        }
        fn intent(&self, i: AgentIntent) {
            self.intents.lock().unwrap().push(i);
        }
    }

    #[tokio::test]
    async fn mock_turn_drives_the_whole_loop_read_only() {
        let scope = Scope { profile: "prod".into(), region: "us-east-1".into() };
        let rec = Recorder::default();
        let stop = MockAcpSession::new(scope)
            .prompt("where's the latest deployment?", &rec)
            .await
            .unwrap();
        assert_eq!(stop, "end_turn");

        let intents = rec.intents.lock().unwrap();
        // Exactly one navigate and one proposal reached the shell — the write did not.
        assert_eq!(intents.len(), 2);
        assert!(matches!(intents[0], AgentIntent::Navigate { .. }));
        assert!(matches!(intents[1], AgentIntent::Propose { .. }));

        // The attempted write surfaced as a Blocked tool result, never as an intent.
        let updates = rec.updates.lock().unwrap();
        let blocked = updates.iter().any(|u| {
            matches!(u, AgentSessionUpdate::ToolResult { status: ToolCallStatus::Blocked, .. })
        });
        assert!(blocked, "the scale_service write must be blocked");
    }
}
