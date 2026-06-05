//! The read-only contract, in code.
//!
//! The agent's entire tool surface is the read tools plus two non-executing
//! UI-intent tools. No tool here reaches an AWS mutation: a `propose_action`
//! call opens a prefilled-but-unconfirmed dialog and `navigate` opens a tab —
//! the human, clicking confirm, is the only thing that ever writes to AWS.

/// AWS read tools. Each maps to an existing read command / `resources/*`
/// read — one fetch path, same pool and cache discipline as the UI.
pub const READ_TOOLS: &[&str] = &[
    "list_scopes",
    "list_clusters",
    "get_cluster_resources",
    "get_task_definition",
    "list_task_def_revisions",
    "get_target_health",
    "get_scaling",
    "get_service_metrics",
    "get_cluster_metrics",
    "get_alb_metrics",
    "get_recent_logs",
    "describe_eni",
    "get_active_view",
    "list_open_tabs",
];

/// Non-executing UI effects. They emit an intent to the
/// shell and call no AWS mutation.
pub const UI_INTENT_TOOLS: &[&str] = &["navigate", "propose_action"];

/// Mutating / secret-revealing commands that must NEVER be reachable from an
/// agent tool call. Kept here so the test below is the regression guard: adding
/// a write to the registry, or a write name to the read list, fails the build.
pub const WRITE_COMMANDS: &[&str] = &[
    "scale_service",
    "update_service",
    "force_deploy",
    "enable_exec",
    "deploy_image",
    "create_service",
    "delete_service",
    "create_cluster",
    "delete_cluster",
    "stop_task",
    "run_task",
    "register_revision",
    "register_task_def",
    "deregister_task_def",
    // ECS Exec opens an interactive shell *inside* a running container — must never be
    // reachable from the agent.
    "exec_start",
    "exec_write",
    "exec_resize",
    "exec_stop",
    "set_scopes",
    "reveal_secret",
];

/// How the guard classifies an inbound tool name before dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolClass {
    /// AWS read — dispatch through `resources/*`.
    Read,
    /// UI effect — emit an intent to the shell; no AWS call.
    UiIntent,
    /// Not on the allowlist — reject, trace, surface a "blocked — read-only" card.
    Denied,
}

/// Classify a tool the agent asked to call. The default is `Denied`: anything
/// not explicitly listed is refused, so a new tool is read-only-by-omission
/// until someone deliberately allowlists it (and the test below reviews it).
pub fn classify(tool: &str) -> ToolClass {
    if READ_TOOLS.contains(&tool) {
        ToolClass::Read
    } else if UI_INTENT_TOOLS.contains(&tool) {
        ToolClass::UiIntent
    } else {
        ToolClass::Denied
    }
}

/// Every tool advertised to the agent's MCP server (`mercek-ecs-readonly`).
pub fn registered_tools() -> Vec<&'static str> {
    READ_TOOLS
        .iter()
        .chain(UI_INTENT_TOOLS.iter())
        .copied()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The headline invariant: no tool the agent can name is a write.
    #[test]
    fn no_registered_tool_is_a_write() {
        for tool in registered_tools() {
            assert!(
                !WRITE_COMMANDS.contains(&tool),
                "tool `{tool}` is registered for the agent but is a write command — \
                 the agent panel must be read-only"
            );
            assert_ne!(
                classify(tool),
                ToolClass::Denied,
                "registered tool `{tool}` classifies as Denied — registry/classify drift"
            );
        }
    }

    /// Read and UI-intent sets are disjoint — a tool is one or the other.
    #[test]
    fn read_and_intent_tools_are_disjoint() {
        for r in READ_TOOLS {
            assert!(!UI_INTENT_TOOLS.contains(r), "`{r}` is in both tool sets");
        }
    }

    /// Writes are denied; the two intent tools are intents, not writes.
    #[test]
    fn writes_are_denied_intents_are_intents() {
        for w in WRITE_COMMANDS {
            assert_eq!(classify(w), ToolClass::Denied, "write `{w}` is not denied");
        }
        assert_eq!(classify("propose_action"), ToolClass::UiIntent);
        assert_eq!(classify("navigate"), ToolClass::UiIntent);
        assert_eq!(classify("get_cluster_resources"), ToolClass::Read);
        assert_eq!(classify("definitely_not_a_tool"), ToolClass::Denied);
    }
}
