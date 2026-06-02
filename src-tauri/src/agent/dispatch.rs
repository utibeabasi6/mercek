//! Turning an agent tool call into an effect (agent-panel spec §4.3, §5).
//!
//! Read tools dispatch to `resources/*` (wired with the MCP tool server in the
//! next slice). The two UI-intent tools parse here into an [`AgentIntent`] the
//! command layer emits to the shell — they perform no AWS work. Anything off the
//! allowlist is refused before it can do anything.

use serde_json::Value;

use crate::agent::bridge::{classify, ToolClass};
use crate::domain::AgentIntent;
use crate::error::{AppError, AppResult};

/// What a classified tool call resolves to.
pub enum ToolOutcome {
    /// A read result to hand back to the agent (JSON). Real `resources/*` wiring
    /// lands with the MCP server; until then reads are served by the session impl.
    Read(Value),
    /// A UI effect to emit to the shell (navigate / propose). No AWS call.
    Intent(AgentIntent),
    /// Off the allowlist — refused (spec §4.3); surfaced as a "blocked" card.
    Blocked,
}

/// Parse a UI-intent tool call into its [`AgentIntent`]. `navigate` and
/// `propose_action` carry their payload as JSON the agent supplies; the shapes
/// match [`crate::domain::NavigateIntent`] / [`crate::domain::ProposedAction`].
pub fn parse_intent(tool: &str, args: &Value) -> AppResult<AgentIntent> {
    match tool {
        "navigate" => {
            let intent = serde_json::from_value(args.clone())
                .map_err(|e| AppError::internal(format!("navigate args: {e}")))?;
            Ok(AgentIntent::Navigate { intent })
        }
        "propose_action" => {
            // The proposal may be the bare ProposedAction or wrapped as { proposal }.
            let raw = args.get("proposal").cloned().unwrap_or_else(|| args.clone());
            let action = serde_json::from_value(raw)
                .map_err(|e| AppError::internal(format!("propose_action args: {e}")))?;
            Ok(AgentIntent::Propose { action })
        }
        other => Err(AppError::internal(format!("not a UI-intent tool: {other}"))),
    }
}

/// Classify a tool call and, for UI intents, build the effect. Read dispatch is
/// the session impl's job for now (the mock serves canned reads); this is the
/// guard + intent path that the read-only contract hinges on.
pub fn route(tool: &str, args: &Value) -> AppResult<ToolOutcome> {
    match classify(tool) {
        ToolClass::UiIntent => Ok(ToolOutcome::Intent(parse_intent(tool, args)?)),
        ToolClass::Denied => Ok(ToolOutcome::Blocked),
        ToolClass::Read => Ok(ToolOutcome::Read(Value::Null)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{AgentIntent, NavigateTarget, ProposedAction};
    use serde_json::json;

    #[test]
    fn parses_navigate_intent() {
        let args = json!({
            "scope": { "profile": "prod", "region": "us-east-1" },
            "target": "service",
            "key": "backend/api",
            "section": "deployments",
            "focusId": "ecs-svc/123",
        });
        let AgentIntent::Navigate { intent } = parse_intent("navigate", &args).unwrap() else {
            panic!("expected navigate");
        };
        assert!(matches!(intent.target, NavigateTarget::Service));
        assert_eq!(intent.key, "backend/api");
        assert_eq!(intent.section.as_deref(), Some("deployments"));
    }

    #[test]
    fn parses_scale_proposal() {
        let args = json!({
            "kind": "scale",
            "scope": { "profile": "prod", "region": "us-east-1" },
            "cluster": "backend",
            "service": "api",
            "desiredCount": 8,
        });
        let AgentIntent::Propose { action } = parse_intent("propose_action", &args).unwrap() else {
            panic!("expected propose");
        };
        match action {
            ProposedAction::Scale { service, desired_count, .. } => {
                assert_eq!(service, "api");
                assert_eq!(desired_count, 8);
            }
            _ => panic!("expected scale"),
        }
    }

    #[test]
    fn route_blocks_writes() {
        assert!(matches!(
            route("scale_service", &json!({})).unwrap(),
            ToolOutcome::Blocked
        ));
        assert!(matches!(route("reveal_secret", &json!({})).unwrap(), ToolOutcome::Blocked));
        assert!(matches!(route("navigate", &json!({
            "scope": { "profile": "p", "region": "r" }, "target": "cluster", "key": "c"
        })).unwrap(), ToolOutcome::Intent(_)));
    }
}
