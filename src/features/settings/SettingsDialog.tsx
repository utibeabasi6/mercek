import { useAgents } from "@/features/agent/api";
import { Select } from "@/components/ui/Select";
import { IconButton } from "@/components/ui/IconButton";
import { PREF, setPref, usePref } from "@/lib/prefs";
import { useTheme } from "@/app/providers";

// User preferences. Persisted to localStorage via
// `prefs`. The default agent is auto-connected when the agent panel opens.
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { data: agents } = useAgents();
  const defaultAgent = usePref(PREF.defaultAgent) ?? "";
  const model = usePref(PREF.agentModel(defaultAgent)) ?? "";
  const modelEnv: Record<string, string> = {
    "claude-code": "ANTHROPIC_MODEL",
    gemini: "GEMINI_MODEL",
  };
  const selectedAgentName = agents?.find((a) => a.id === defaultAgent)?.name;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[520px] max-w-[92vw] overflow-hidden rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border px-4 py-2.5">
          <span className="text-fg">settings</span>
          <IconButton onClick={onClose} aria-label="close settings" className="ml-auto">
            ✕
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

            {defaultAgent && (
              <label className="mt-1 flex items-center gap-3">
                <span className="w-28 text-fg-dim">model</span>
                <input
                  value={model}
                  onChange={(e) => setPref(PREF.agentModel(defaultAgent), e.target.value)}
                  placeholder={
                    modelEnv[defaultAgent]
                      ? `e.g. a model id (sets ${modelEnv[defaultAgent]})`
                      : "harness picks the model"
                  }
                  className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                />
              </label>
            )}
            {defaultAgent && (
              <p className="text-[11px] text-fg-muted">
                {modelEnv[defaultAgent]
                  ? `Injected into ${selectedAgentName}'s environment as ${modelEnv[defaultAgent]} on connect.`
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
