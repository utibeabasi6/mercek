//! The in-process read-only MCP tool server, bridged to
//! the agent over the ACP connection — NO TCP port (same mechanism as Zed). It is
//! a real `rmcp` server (so the harness's standard MCP client sees the tools) wired
//! via `from_rmcp`. It exposes ONLY read tools + the two non-executing UI-intent
//! tools, so it is read-only by construction.

use std::sync::{Arc, Mutex as StdMutex};

use agent_client_protocol::mcp_server::McpServer;
use agent_client_protocol::{Agent, NullRun};
use agent_client_protocol_rmcp::McpServerExt;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, Content, ServerCapabilities, ServerInfo};
use rmcp::{tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler};
use serde_json::Value;

use crate::agent::dispatch::{self, AgentCtx};
use crate::agent::session::AgentSink;

/// The current turn's sink, set by `prompt` before each turn so the navigate /
/// propose tool handlers emit to the live channel.
pub type SharedSink = Arc<StdMutex<Option<Arc<dyn AgentSink>>>>;

const INSTRUCTIONS: &str = include_str!("instructions.md");

// Free-form tool arguments. A bare `serde_json::Value` makes rmcp derive the schema
// `{"title":"AnyValue"}`, which has no `"type":"object"` — and the Anthropic tools
// API rejects any tool whose `input_schema` isn't an object, so the server would
// connect but its tools never registered ("instructions arrived, tools did not").
// A string-keyed map yields a valid `{"type":"object"}` schema while still accepting
// whatever keys the agent sends — each tool parses them leniently in `dispatch`.
// Using `//` (not `///`) keeps this rationale out of the schema's `description`.
#[derive(serde::Deserialize, rmcp::schemars::JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(transparent)]
pub struct ToolArgs(std::collections::HashMap<String, Value>);

impl ToolArgs {
    fn into_value(self) -> Value {
        Value::Object(self.0.into_iter().collect())
    }
}

#[derive(Clone)]
pub struct EcsToolServer {
    ctx: AgentCtx,
    sink: SharedSink,
    #[allow(dead_code)] // read by the generated #[tool_handler] dispatch
    tool_router: ToolRouter<EcsToolServer>,
}

impl EcsToolServer {
    pub fn new(ctx: AgentCtx, sink: SharedSink) -> Self {
        Self {
            ctx,
            sink,
            tool_router: Self::tool_router(),
        }
    }

    async fn read(&self, tool: &str, input: ToolArgs) -> Result<CallToolResult, McpError> {
        let v = dispatch::read_tool(&self.ctx, tool, &input.into_value())
            .await
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        Ok(CallToolResult::success(vec![Content::text(v.to_string())]))
    }

    fn emit(&self, tool: &str, input: ToolArgs, ok: &str) -> Result<CallToolResult, McpError> {
        let input = input.into_value();
        let intent = dispatch::parse_intent(tool, &input)
            .map_err(|e| McpError::internal_error(e.to_string(), None))?;
        let success = || Ok(CallToolResult::success(vec![Content::text(ok.to_string())]));
        // In-process sink (when the server runs inside the app).
        if let Some(s) = self.sink.lock().unwrap_or_else(|e| e.into_inner()).clone() {
            s.intent(intent);
            return success();
        }
        // The `mercek --mcp` subprocess: hand the intent back to the running app
        // over the IPC socket, which drives the panel (open a tab / confirm dialog).
        if crate::agent::ipc::send(&intent).is_ok() {
            return success();
        }
        // No app attached at all (e.g. the plain `claude` CLI). Be honest rather
        // than claim a navigation/proposal that can't happen here.
        Ok(CallToolResult::success(vec![Content::text(
            "This action needs Mercek's in-app agent panel (no UI is attached to this \
             session). Tell the user what you'd change instead.",
        )]))
    }
}

#[tool_router]
impl EcsToolServer {
    #[tool(description = "List the activated (profile,region) scopes.")]
    async fn list_scopes(&self, Parameters(i): Parameters<ToolArgs>) -> Result<CallToolResult, McpError> {
        self.read("list_scopes", i).await
    }

    #[tool(description = "List ECS clusters + capacity providers in a scope. Args: scope.")]
    async fn list_clusters(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("list_clusters", i).await
    }

    #[tool(
        description = "Services, tasks and container instances for a cluster. Args: scope, cluster."
    )]
    async fn get_cluster_resources(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("get_cluster_resources", i).await
    }

    #[tool(
        description = "Describe a task definition (env, secrets masked, volumes). Args: scope, arn."
    )]
    async fn get_task_definition(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("get_task_definition", i).await
    }

    #[tool(description = "List task-definition revision ARNs for a family. Args: scope, family.")]
    async fn list_task_def_revisions(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("list_task_def_revisions", i).await
    }

    #[tool(description = "Target-group health for a service. Args: scope, targetGroupArn.")]
    async fn get_target_health(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("get_target_health", i).await
    }

    #[tool(description = "Scalable target + policies for a service. Args: scope, cluster, service.")]
    async fn get_scaling(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("get_scaling", i).await
    }

    #[tool(description = "Describe an elastic network interface. Args: scope, eniId.")]
    async fn describe_eni(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.read("describe_eni", i).await
    }

    #[tool(
        description = "Open/focus a screen for the user. Args: scope, target (cluster|service|task), key (cluster name, `cluster/service`, or task ARN), section?, focusId?."
    )]
    async fn navigate(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.emit("navigate", i, "navigated")
    }

    #[tool(
        description = "Surface a draft mutation for the human to confirm — NON-EXECUTING. Args: a ProposedAction { kind: scale|updateService|forceDeploy|stopTask, scope, ... }."
    )]
    async fn propose_action(
        &self,
        Parameters(i): Parameters<ToolArgs>,
    ) -> Result<CallToolResult, McpError> {
        self.emit("propose_action", i, "surfaced to the user for confirmation")
    }
}

#[tool_handler]
impl ServerHandler for EcsToolServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions(INSTRUCTIONS)
    }
}

/// Build the read-only ECS tool server, bridged to the agent over ACP.
pub fn build_server(ctx: AgentCtx, sink: SharedSink) -> McpServer<Agent, NullRun> {
    McpServer::from_rmcp("mercek-ecs-readonly", move || {
        EcsToolServer::new(ctx.clone(), sink.clone())
    })
}

/// Run the read-only ECS tools as a standalone stdio MCP server (`mercek --mcp`),
/// the way harnesses like Claude Code load MCP servers (see Pencil). It reads
/// `~/.aws` for its own AWS access; there's no UI, so navigate/propose are inert.
/// Blocks until the client (the harness) closes stdin.
pub async fn run_stdio_server() -> anyhow::Result<()> {
    use rmcp::ServiceExt;
    let ctx = AgentCtx {
        pool: Arc::new(crate::aws::client_pool::ClientPool::default()),
    };
    let sink: SharedSink = Arc::new(StdMutex::new(None));
    let running = EcsToolServer::new(ctx, sink)
        .serve(rmcp::transport::io::stdio())
        .await?;
    running.waiting().await?;
    Ok(())
}
