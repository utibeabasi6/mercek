//! The agent panel: connects the user's own coding harness (Claude Code, Codex,
//! Gemini, …) over ACP and exposes ECS to it through a tool surface that is
//! read-only by construction (`bridge`). Covers the harness table (`adapters`),
//! the ACP session (`acp`), the read-only contract + its guard (`bridge`), the
//! MCP tool server (`mcp`), and the navigate/proposal dispatch (`dispatch`).

pub mod acp;
pub mod adapters;
pub mod bridge;
pub mod dispatch;
pub mod ipc;
pub mod mcp;
#[cfg(feature = "mock")]
pub mod mock_session;
pub mod session;
