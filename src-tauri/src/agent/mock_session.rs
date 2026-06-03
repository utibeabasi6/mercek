//! Scripted, offline ACP session for the `mock` feature (tests + the offline
//! demo). It reaches no AWS and spawns no subprocess; it drives the whole loop —
//! a read, a navigate, a scale proposal, and a BLOCKED write — so the read-only
//! contract is exercised end to end without a live harness.

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use crate::agent::bridge::{classify, ToolClass};
use crate::agent::dispatch::{self, ToolOutcome};
use crate::agent::session::{AcpSession, AgentSink};
use crate::domain::{AgentSessionUpdate, Scope, ToolCallStatus};
use crate::error::AppResult;

pub struct MockAcpSession {
    scope: Scope,
}

impl MockAcpSession {
    pub fn new(scope: Scope) -> Self {
        Self { scope }
    }

    fn tool_call(
        &self,
        sink: &dyn AgentSink,
        id: &str,
        tool: &str,
        args: serde_json::Value,
        summary: &str,
    ) {
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
    async fn prompt(&mut self, text: &str, sink: Arc<dyn AgentSink>) -> AppResult<String> {
        let sink: &dyn AgentSink = &*sink;
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

        sink.update(AgentSessionUpdate::Done {
            stop_reason: "end_turn".into(),
        });
        Ok("end_turn".into())
    }

    async fn set_mode(&mut self, _mode_id: String) -> AppResult<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::AgentIntent;
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
        let scope = Scope {
            profile: "prod".into(),
            region: "us-east-1".into(),
        };
        let rec = Arc::new(Recorder::default());
        let stop = MockAcpSession::new(scope)
            .prompt("where's the latest deployment?", rec.clone())
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
            matches!(
                u,
                AgentSessionUpdate::ToolResult {
                    status: ToolCallStatus::Blocked,
                    ..
                }
            )
        });
        assert!(blocked, "the scale_service write must be blocked");
    }
}
