//! The connect/picker table (agent-panel spec §7). New harnesses are entries
//! here, not new code paths. `bin` is what we probe on `PATH` to decide
//! "detected"; spawning its ACP adapter is the ACP slice (`acp.rs`).

use crate::domain::AgentInfo;

pub struct Adapter {
    pub id: &'static str,
    pub name: &'static str,
    pub bin: &'static str,
    pub install_hint: &'static str,
}

pub const ADAPTERS: &[Adapter] = &[
    Adapter {
        id: "claude-code",
        name: "Claude Code",
        bin: "claude",
        install_hint: "install Claude Code: npm i -g @anthropic-ai/claude-code",
    },
    Adapter {
        id: "codex",
        name: "Codex CLI",
        bin: "codex",
        install_hint: "install Codex CLI: npm i -g @openai/codex",
    },
    Adapter {
        id: "gemini",
        name: "Gemini CLI",
        bin: "gemini",
        install_hint: "install Gemini CLI: npm i -g @google/gemini-cli",
    },
    Adapter {
        id: "kimi",
        name: "Kimi CLI",
        bin: "kimi",
        install_hint: "install Kimi CLI: see moonshotai/kimi-cli",
    },
    Adapter {
        id: "opencode",
        name: "OpenCode",
        bin: "opencode",
        install_hint: "install OpenCode: https://opencode.ai",
    },
    Adapter {
        id: "qwen",
        name: "Qwen Code",
        bin: "qwen",
        install_hint: "install Qwen Code: npm i -g @qwen-code/qwen-code",
    },
];

/// Best-effort: is `bin` resolvable on the user's `PATH`? Probe only — we never
/// execute the binary here (no side effects, no auth prompts).
fn on_path(bin: &str) -> bool {
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
