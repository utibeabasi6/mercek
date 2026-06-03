//! The ACP session seam.
//!
//! The real impl ([`crate::agent::acp::SdkAcpSession`]) wraps `agent-client-protocol`
//! (spawn the harness subprocess, speak ACP over stdio) plus the read-only MCP tool
//! server. Tests use the scripted [`crate::agent::mock_session::MockAcpSession`]
//! (the `mock` feature). Keeping this a trait — like the `EcsApi` read seam — lets
//! the command layer stay independent of which is connected.

use std::sync::Arc;

use async_trait::async_trait;

use crate::domain::{AgentIntent, AgentSessionUpdate};
use crate::error::AppResult;

/// Where a turn's output goes: display updates + UI intents. Passed as an `Arc`
/// so the real session can hand a `'static` clone to its background ACP task and
/// MCP tool handlers; the command layer implements it over Tauri channels, tests
/// over a recorder.
pub trait AgentSink: Send + Sync {
    fn update(&self, update: AgentSessionUpdate);
    fn intent(&self, intent: AgentIntent);
}

/// One live connection to a coding harness. `prompt` drives a single user turn,
/// streaming updates/intents through `sink`, and returns the ACP stop reason.
#[async_trait]
pub trait AcpSession: Send + Sync {
    async fn prompt(&mut self, text: &str, sink: Arc<dyn AgentSink>) -> AppResult<String>;
    /// Switch the harness's operating mode (ACP session mode) by id.
    async fn set_mode(&mut self, mode_id: String) -> AppResult<()>;
}
