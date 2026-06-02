import { useState } from "react";
import { useShell } from "@/app/shell";
import { LogTailPanel } from "@/features/logs/components/LogTailPanel";

const PANELS = ["logs", "events", "terminal"] as const;
type Panel = (typeof PANELS)[number];

export function Drawer() {
  const { drawerOpen, toggleDrawer, activeTab } = useShell();
  const [panel, setPanel] = useState<Panel>("logs");

  if (!drawerOpen) return null;

  const taskTab =
    activeTab?.kind === "task" && activeTab.clusterName && activeTab.taskArn ? activeTab : null;

  return (
    <div className="flex h-64 flex-col border-t border-border bg-bg">
      <div className="flex items-center gap-1 border-b border-border px-2">
        {PANELS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPanel(p)}
            disabled={p === "terminal"}
            className={`-mb-px border-b px-2 py-1.5 disabled:opacity-50 ${
              panel === p ? "border-accent text-fg" : "border-transparent text-fg-muted"
            }`}
            title={p === "terminal" ? "ECS Exec terminal lands in Phase 4" : undefined}
          >
            {p}
            {p === "terminal" && " ⋯"}
          </button>
        ))}
        <button
          type="button"
          onClick={toggleDrawer}
          aria-label="close drawer"
          className="ml-auto text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {panel === "logs" &&
          (taskTab ? (
            <LogTailPanel
              key={taskTab.id}
              scope={taskTab.scope}
              cluster={taskTab.clusterName!}
              taskArn={taskTab.taskArn!}
            />
          ) : (
            <div className="p-3 text-fg-muted">open a task to tail its container logs</div>
          ))}
        {panel === "events" && (
          <div className="p-3 text-fg-muted">service / task events aggregate here (next).</div>
        )}
        {panel === "terminal" && (
          <div className="p-3 text-fg-muted">ECS Exec session (Phase 4).</div>
        )}
      </div>
    </div>
  );
}
