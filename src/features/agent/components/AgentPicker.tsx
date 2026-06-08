import { useState } from "react";
import { useAgents } from "@/features/agent/api";
import { Spinner } from "@/components/ui/Spinner";
import type { AgentInfo } from "@/types";

// Lists the supported coding harnesses with detected/install state; picking a
// detected one starts an ACP session.
export function AgentPicker({ onPick }: { onPick: (agent: AgentInfo) => void }) {
  const { data: agents, isLoading } = useAgents();
  // Which undetected harness has its install hint revealed. Click-to-reveal rather than
  // a hover tooltip, so the instructions are actually readable (and reachable by touch).
  const [openHint, setOpenHint] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-[11px] uppercase tracking-wide text-fg-muted">connect agent</div>
      {isLoading && (
        <div className="flex items-center gap-2 text-fg-muted">
          <Spinner className="size-4" /> detecting harnesses…
        </div>
      )}
      <div className="flex flex-col">
        {(agents ?? []).map((a) => {
          const showHint = openHint === a.id;
          return (
            <div key={a.id} className="border-t border-border py-2 first:border-t-0">
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] ${a.detected ? "text-ok" : "text-fg-muted"}`}
                  title={a.detected ? "detected on PATH" : "not found"}
                >
                  {a.detected ? "●" : "○"}
                </span>
                <span className="flex-1 truncate text-fg">{a.name}</span>
                {a.detected ? (
                  <button
                    type="button"
                    onClick={() => onPick(a)}
                    className="rounded border border-accent px-2 py-0.5 text-[12px] text-accent hover:bg-accent hover:text-bg"
                  >
                    use
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setOpenHint((id) => (id === a.id ? null : a.id))}
                    aria-expanded={showHint}
                    className={`rounded border px-2 py-0.5 text-[12px] transition-colors ${
                      showHint
                        ? "border-fg-muted text-fg"
                        : "border-border text-fg-muted hover:border-fg-muted hover:text-fg"
                    }`}
                  >
                    install
                  </button>
                )}
              </div>
              {!a.detected && showHint && (
                <p className="ml-[1.375rem] mt-1.5 break-words rounded bg-bg-elev px-2 py-1.5 text-[11px] leading-relaxed text-fg-dim">
                  {a.installHint ?? "Not found on your PATH."}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-fg-muted">
        Mercek runs no model — it connects your own harness over ACP. The agent gets a strictly
        read-only view of ECS; it can navigate and propose actions, but only you can execute a
        change.
      </p>
    </div>
  );
}
