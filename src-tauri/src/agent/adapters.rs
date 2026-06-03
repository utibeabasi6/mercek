//! The connect/picker table. New harnesses are entries
//! here, not new code paths. `bin` is what we probe on `PATH` to decide
//! "detected"; spawning its ACP adapter is the ACP slice (`acp.rs`).

use crate::domain::AgentInfo;

pub struct Adapter {
    pub id: &'static str,
    pub name: &'static str,
    /// Binary we probe on PATH to decide "detected".
    pub bin: &'static str,
    /// Command line spawned to speak ACP over stdio (parsed by `AcpAgent::from_str`).
    pub acp_command: &'static str,
    /// Env var the harness reads to pick a model, if known. A user model preference
    /// is injected into the subprocess env under this name (best-effort per harness).
    pub model_env: Option<&'static str>,
    pub install_hint: &'static str,
}

pub const ADAPTERS: &[Adapter] = &[
    Adapter {
        id: "claude-code",
        name: "Claude Code",
        bin: "claude",
        // Like Zed, run the ACP adapter via npx so it's fetched on demand rather
        // than requiring a global install (the adapter vendors the Claude Code CLI).
        acp_command: "npx -y @zed-industries/claude-code-acp",
        model_env: Some("ANTHROPIC_MODEL"),
        install_hint: "needs Node/npx (Claude Code already implies it); the adapter is fetched on first run",
    },
    Adapter {
        id: "codex",
        name: "Codex CLI",
        bin: "codex",
        acp_command: "codex-acp",
        model_env: None,
        install_hint: "install Codex CLI: npm i -g @openai/codex",
    },
    Adapter {
        id: "gemini",
        name: "Gemini CLI",
        bin: "gemini",
        acp_command: "gemini --experimental-acp",
        model_env: Some("GEMINI_MODEL"),
        install_hint: "install Gemini CLI: npm i -g @google/gemini-cli",
    },
    Adapter {
        id: "kimi",
        name: "Kimi CLI",
        bin: "kimi",
        acp_command: "kimi --acp",
        model_env: None,
        install_hint: "install Kimi CLI: see moonshotai/kimi-cli",
    },
    Adapter {
        id: "opencode",
        name: "OpenCode",
        bin: "opencode",
        acp_command: "opencode",
        model_env: None,
        install_hint: "install OpenCode: https://opencode.ai",
    },
    Adapter {
        id: "qwen",
        name: "Qwen Code",
        bin: "qwen",
        acp_command: "qwen --experimental-acp",
        model_env: None,
        install_hint: "install Qwen Code: npm i -g @qwen-code/qwen-code",
    },
];

/// Look up an adapter by its stable id (e.g. "claude-code").
pub fn find(id: &str) -> Option<&'static Adapter> {
    ADAPTERS.iter().find(|a| a.id == id)
}

/// Best-effort: is `bin` resolvable on the user's `PATH`? Probe only — we never
/// execute the binary here (no side effects, no auth prompts).
pub fn on_path(bin: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else {
        return false;
    };
    std::env::split_paths(&path).any(|dir| {
        let candidate = dir.join(bin);
        candidate.is_file()
            || candidate.with_extension("exe").is_file()
            || candidate.with_extension("cmd").is_file()
    })
}

/// The picker list: every adapter, marked detected, with an install hint when not.
pub fn list() -> Vec<AgentInfo> {
    ADAPTERS
        .iter()
        .map(|a| {
            let detected = on_path(a.bin);
            AgentInfo {
                id: a.id.to_string(),
                name: a.name.to_string(),
                detected,
                install_hint: if detected {
                    None
                } else {
                    Some(a.install_hint.to_string())
                },
            }
        })
        .collect()
}
