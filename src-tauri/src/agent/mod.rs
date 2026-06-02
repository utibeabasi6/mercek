//! Phase 5 agent panel (spec: `specs/agent-panel.md`).
//!
//! Connects the user's own coding harness (Claude Code, Codex, Gemini, …) over
//! ACP and exposes ECS to it through a tool surface that is read-only by
//! construction (`bridge`). The ACP client + in-process MCP tool server +
//! navigate/proposal channels land in the next slice; this slice ships the
//! harness table (`adapters`) and the read-only contract + its guard (`bridge`).

pub mod adapters;
pub mod bridge;
pub mod dispatch;
pub mod session;
