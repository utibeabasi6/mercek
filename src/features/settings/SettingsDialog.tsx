import { useEffect, useState } from "react";
import { useAgents } from "@/features/agent/api";
import { X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/IconButton";
import { PREF, setPref, usePref } from "@/lib/prefs";
import { useTheme } from "@/app/providers";

// Env var each harness reads to pick a model (mirrors the backend adapter table). Only
// agents listed here let Mercek set the model; others use whatever the harness is
// configured with.
const MODEL_ENV: Record<string, string> = {
  "claude-code": "ANTHROPIC_MODEL",
  gemini: "GEMINI_MODEL",
};

// Curated model menus per agent. The "custom…" option keeps the door open for a model
// id that isn't listed (or a newer one), so the menu never blocks a valid value.
const AGENT_MODELS: Record<string, { value: string; label: string }[]> = {
  "claude-code": [
    { value: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  gemini: [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
};

const CUSTOM = "__custom__";

// User preferences. Persisted to localStorage via `prefs`. The default agent is
// auto-connected when the agent panel opens.
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { data: agents } = useAgents();
  const defaultAgent = usePref(PREF.defaultAgent) ?? "";
  const model = usePref(PREF.agentModel(defaultAgent)) ?? "";
  const selectedAgentName = agents?.find((a) => a.id === defaultAgent)?.name;

  const modelEnv = MODEL_ENV[defaultAgent];
  const models = AGENT_MODELS[defaultAgent] ?? [];
  const isKnown = model !== "" && models.some((m) => m.value === model);
  const isCustom = model !== "" && !isKnown;
  const [customOpen, setCustomOpen] = useState(isCustom);
  // Reset the custom toggle when switching agents (each agent has its own model pref).
  useEffect(() => setCustomOpen(false), [defaultAgent]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[520px] max-w-[92vw] rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-4 py-2.5">
          <span className="text-fg">settings</span>
          <IconButton onClick={onClose} aria-label="close settings" className="ml-auto">
            <X />
          </IconButton>
        </div>

        <div className="flex flex-col gap-5 p-4">
          <section className="flex flex-col gap-2">
            <div className="text-[11px] uppercase tracking-wide text-fg-muted">agent</div>
            <label className="flex items-center gap-3">
              <span className="w-28 text-fg-dim">default agent</span>
              <div className="min-w-0 flex-1">
                <Select
                  value={defaultAgent}
                  onChange={(v) => setPref(PREF.defaultAgent, v)}
                  placeholder="none — pick each session"
                  options={[
                    { value: "", label: "none — pick each session" },
                    ...(agents ?? []).map((a) => ({
                      value: a.id,
                      label: a.detected ? a.name : `${a.name} (not detected)`,
                    })),
                  ]}
                />
              </div>
            </label>
            <p className="text-[11px] text-fg-muted">
              Auto-connected when the agent panel opens ({/* */}⌘J).
            </p>

            {defaultAgent && modelEnv && (
              <label className="mt-1 flex items-center gap-3">
                <span className="w-28 text-fg-dim">model</span>
                <div className="min-w-0 flex-1">
                  <Select
                    value={customOpen || isCustom ? CUSTOM : model}
                    onChange={(v) => {
                      if (v === CUSTOM) {
                        setCustomOpen(true);
                      } else {
                        setCustomOpen(false);
                        setPref(PREF.agentModel(defaultAgent), v);
                      }
                    }}
                    options={[
                      { value: "", label: "harness default" },
                      ...models,
                      { value: CUSTOM, label: "custom…" },
                    ]}
                  />
                </div>
              </label>
            )}
            {defaultAgent && modelEnv && (customOpen || isCustom) && (
              <label className="flex items-center gap-3">
                <span className="w-28 text-fg-dim">model id</span>
                <input
                  autoFocus
                  value={model}
                  onChange={(e) => setPref(PREF.agentModel(defaultAgent), e.target.value)}
                  placeholder="exact model id"
                  className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                />
              </label>
            )}
            {defaultAgent && (
              <p className="text-[11px] text-fg-muted">
                {modelEnv
                  ? `Injected into ${selectedAgentName}'s environment as ${modelEnv} on connect.`
                  : `Mercek can't set ${selectedAgentName}'s model — it uses whatever the harness is configured with.`}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <div className="text-[11px] uppercase tracking-wide text-fg-muted">appearance</div>
            <label className="flex items-center gap-3">
              <span className="w-28 text-fg-dim">theme</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="rounded border border-border px-3 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
              >
                {theme === "dark" ? "dark" : "light"} — switch
              </button>
            </label>
          </section>
        </div>
      </div>
    </div>
  );
}
