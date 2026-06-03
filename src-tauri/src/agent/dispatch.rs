//! Turning an agent tool call into an effect.
//!
//! Read tools dispatch to `resources/*`. The two UI-intent tools parse here into
//! an [`AgentIntent`] the command layer emits to the shell — they perform no AWS
//! work. Anything off the allowlist is refused before it can do anything.

use std::sync::Arc;

use serde_json::Value;

use crate::agent::bridge::{classify, ToolClass};
use crate::aws::client_pool::ClientPool;
use crate::domain::{AgentIntent, Scope};
use crate::error::{AppError, AppResult};

/// The pool the agent's read tools dispatch through. Just a `ClientPool` (no redb
/// store — the `mercek --mcp` subprocess can't open the app's exclusive store, so
/// `list_scopes` reads `~/.aws` directly instead).
#[derive(Clone)]
pub struct AgentCtx {
    pub pool: Arc<ClientPool>,
}

/// What a classified tool call resolves to.
pub enum ToolOutcome {
    /// A read result to hand back to the agent (JSON).
    Read(Value),
    /// A UI effect to emit to the shell (navigate / propose). No AWS call.
    Intent(AgentIntent),
    /// Off the allowlist — refused; surfaced as a "blocked" card.
    Blocked,
}

/// Parse a UI-intent tool call into its [`AgentIntent`]. `navigate` and
/// `propose_action` carry their payload as JSON the agent supplies; the shapes
/// match [`crate::domain::NavigateIntent`] / [`crate::domain::ProposedAction`].
pub fn parse_intent(tool: &str, args: &Value) -> AppResult<AgentIntent> {
    match tool {
        "navigate" => {
            let intent = serde_json::from_value(normalize_scope(camel_keys(args.clone())))
                .map_err(|e| AppError::internal(format!("navigate args: {e}")))?;
            Ok(AgentIntent::Navigate { intent })
        }
        "propose_action" => {
            // The proposal may be the bare ProposedAction or wrapped as { proposal }.
            let raw = args.get("proposal").cloned().unwrap_or_else(|| args.clone());
            let action = serde_json::from_value(normalize_scope(camel_keys(raw)))
                .map_err(|e| AppError::internal(format!("propose_action args: {e}")))?;
            Ok(AgentIntent::Propose { action })
        }
        other => Err(AppError::internal(format!("not a UI-intent tool: {other}"))),
    }
}

/// Classify a tool call and, for UI intents, build the effect. Used by the mock
/// session and as the guard the read-only contract hinges on.
pub fn route(tool: &str, args: &Value) -> AppResult<ToolOutcome> {
    match classify(tool) {
        ToolClass::UiIntent => Ok(ToolOutcome::Intent(parse_intent(tool, args)?)),
        ToolClass::Denied => Ok(ToolOutcome::Blocked),
        ToolClass::Read => Ok(ToolOutcome::Read(Value::Null)),
    }
}

/// Resolve the `scope` argument leniently. Harnesses don't always send a nested
/// object: Claude Code was observed stringifying it (`scope: "{\"profile\":…}"`)
/// and sometimes flattens `profile`/`region` alongside the other args. Accept all
/// three shapes so a read doesn't fail on a formatting quirk (which the agent then
/// misreads as "the tools aren't connected").
/// Agents often emit snake_case keys (`task_definition`, `desired_count`, `focus_id`)
/// while the intent/proposal types are camelCase — serde would silently drop those.
/// Rewrite the top-level object's keys to camelCase so they're not lost. (Shallow:
/// the only nested object is `scope`, whose fields are already single words.)
fn camel_keys(v: Value) -> Value {
    let Value::Object(map) = v else { return v };
    let mut out = serde_json::Map::with_capacity(map.len());
    for (k, val) in map {
        let camel = if k.contains('_') {
            let mut s = String::with_capacity(k.len());
            let mut up = false;
            for c in k.chars() {
                if c == '_' {
                    up = true;
                } else if up {
                    s.extend(c.to_uppercase());
                    up = false;
                } else {
                    s.push(c);
                }
            }
            s
        } else {
            k
        };
        out.entry(camel).or_insert(val); // keep an existing camelCase key if both are present
    }
    Value::Object(out)
}

/// Some harnesses stringify the nested `scope` object; if so, parse it back so the
/// intent's `scope` field deserializes (same quirk `scope_arg` handles for reads).
fn normalize_scope(mut v: Value) -> Value {
    let parsed = match v.get("scope") {
        Some(Value::String(s)) => serde_json::from_str::<Value>(s).ok(),
        _ => None,
    };
    if let (Some(parsed), Some(obj)) = (parsed, v.as_object_mut()) {
        obj.insert("scope".to_string(), parsed);
    }
    v
}

fn scope_arg(args: &Value) -> AppResult<Scope> {
    if let Some(raw) = args.get("scope") {
        // A JSON-string of the object, or the object itself.
        let v = match raw {
            Value::String(s) => serde_json::from_str::<Value>(s).unwrap_or_else(|_| raw.clone()),
            other => other.clone(),
        };
        if let Ok(scope) = serde_json::from_value::<Scope>(v) {
            return Ok(scope);
        }
    }
    // Flat `profile` + `region` siblings of the other args.
    if let (Some(profile), Some(region)) = (
        args.get("profile").and_then(Value::as_str),
        args.get("region").and_then(Value::as_str),
    ) {
        if let Ok(scope) =
            serde_json::from_value::<Scope>(serde_json::json!({ "profile": profile, "region": region }))
        {
            return Ok(scope);
        }
    }
    // Self-healing: hand the agent the real scopes inline so it can retry in one
    // step (no separate list_scopes round-trip needed).
    let scopes: Vec<_> = crate::aws::profiles::discover_profiles()
        .into_iter()
        .map(|p| serde_json::json!({ "profile": p.name, "region": p.region_default }))
        .collect();
    Err(AppError::internal(format!(
        "missing/invalid `scope`. Pass a scope object like {{\"profile\":\"…\",\"region\":\"…\"}}. \
         Available scopes: {}",
        Value::Array(scopes)
    )))
}

fn str_arg(args: &Value, key: &str) -> AppResult<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| AppError::internal(format!("missing argument: {key}")))
}

fn jval<T: serde::Serialize>(v: T) -> AppResult<Value> {
    serde_json::to_value(v).map_err(|e| AppError::internal(format!("serialize: {e}")))
}

/// Execute a READ tool against real AWS via the pool, returning JSON for the agent
///. The guard refuses anything that isn't a read; mutations
/// and `reveal_secret` are unreachable here. One fetch path — same pool, same
/// mapping as the UI's read commands.
pub async fn read_tool(ctx: &AgentCtx, tool: &str, args: &Value) -> AppResult<Value> {
    if classify(tool) != ToolClass::Read {
        return Err(AppError::internal(format!(
            "`{tool}` is not a read tool — refused (agent panel is read-only)"
        )));
    }
    match tool {
        // Clean { profile, region } pairs — NOT the raw profile records (whose
        // "unresolved" status + null accountId can be misread as "not connected").
        "list_scopes" => {
            let scopes: Vec<_> = crate::aws::profiles::discover_profiles()
                .into_iter()
                .map(|p| serde_json::json!({ "profile": p.name, "region": p.region_default }))
                .collect();
            jval(scopes)
        }
        "list_clusters" => {
            let scope = scope_arg(args)?;
            let ecs = ctx.pool.get(&scope).await?.ecs.clone();
            jval(crate::discovery::discover_clusters(ecs, scope).await?)
        }
        "get_cluster_resources" => {
            let scope = scope_arg(args)?;
            let cluster = str_arg(args, "cluster")?;
            let ecs = ctx.pool.get(&scope).await?.ecs.clone();
            jval(crate::discovery::cluster_resources(ecs, cluster).await?)
        }
        "get_task_definition" => {
            let scope = scope_arg(args)?;
            let arn = str_arg(args, "arn")?;
            let ecs = ctx.pool.get(&scope).await?.ecs.clone();
            jval(ecs.describe_task_definition(&arn).await?)
        }
        "list_task_def_revisions" => {
            let scope = scope_arg(args)?;
            let family = str_arg(args, "family")?;
            let ecs = ctx.pool.get(&scope).await?.ecs.clone();
            jval(ecs.list_task_definitions(&family).await?)
        }
        "get_target_health" => {
            let scope = scope_arg(args)?;
            let tg = str_arg(args, "targetGroupArn")?;
            let elb = ctx.pool.get(&scope).await?.elb.clone();
            jval(elb.describe_target_health(&tg).await?)
        }
        "get_scaling" => {
            let scope = scope_arg(args)?;
            let cluster = str_arg(args, "cluster")?;
            let service = str_arg(args, "service")?;
            let resource_id = format!("service/{cluster}/{service}");
            let asg = ctx.pool.get(&scope).await?.autoscaling.clone();
            jval(asg.scaling(&resource_id).await?)
        }
        "describe_eni" => {
            let scope = scope_arg(args)?;
            let eni = str_arg(args, "eniId")?;
            let ec2 = ctx.pool.get(&scope).await?.ec2.clone();
            jval(ec2.describe_eni(&eni).await?)
        }
        other => Err(AppError::internal(format!(
            "read tool `{other}` is recognized but has no data source"
        ))),
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
    fn scope_arg_accepts_object_string_and_flat() {
        // Nested object (the documented shape).
        let s = scope_arg(&json!({ "scope": { "profile": "p", "region": "r" } })).unwrap();
        assert_eq!((s.profile.as_str(), s.region.as_str()), ("p", "r"));
        // Stringified object (Claude Code was observed sending this).
        let s = scope_arg(&json!({ "scope": "{\"profile\":\"p\",\"region\":\"r\"}" })).unwrap();
        assert_eq!((s.profile.as_str(), s.region.as_str()), ("p", "r"));
        // Flat siblings.
        let s = scope_arg(&json!({ "profile": "p", "region": "r", "cluster": "c" })).unwrap();
        assert_eq!((s.profile.as_str(), s.region.as_str()), ("p", "r"));
        // Nothing usable → a guiding error.
        assert!(scope_arg(&json!({})).is_err());
    }

    #[test]
    fn parses_snake_case_proposal() {
        // Agent sent snake_case fields + a stringified scope — both must survive.
        let args = json!({
            "kind": "updateService",
            "scope": "{\"profile\":\"p\",\"region\":\"r\"}",
            "cluster": "c",
            "service": "api",
            "task_definition": "api:42",
        });
        let AgentIntent::Propose { action } = parse_intent("propose_action", &args).unwrap() else {
            panic!("expected propose");
        };
        match action {
            ProposedAction::UpdateService { task_definition, scope, .. } => {
                assert_eq!(task_definition.as_deref(), Some("api:42"));
                assert_eq!(scope.profile, "p");
            }
            _ => panic!("expected updateService"),
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
