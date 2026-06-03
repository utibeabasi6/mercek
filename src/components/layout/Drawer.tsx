import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { useShell } from "@/app/shell";
import { LogTailPanel } from "@/features/logs/components/LogTailPanel";

const PANELS = ["logs", "events", "terminal"] as const;
type Panel = (typeof PANELS)[number];

export function Drawer() {
  const { drawerOpen, toggleDrawer, activeTab } = useShell();
  const [panel, setPanel] = useState<Panel>("logs");
  const [height, setHeight] = useState(() => {
    const v = Number(localStorage.getItem("mercek.drawerHeight"));
    return v >= 120 && v <= 700 ? v : 256;
  });
  useEffect(() => {
    localStorage.setItem("mercek.drawerHeight", String(height));
  }, [height]);

  if (!drawerOpen) return null;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: MouseEvent) =>
      setHeight(Math.min(700, Math.max(120, startH + (startY - ev.clientY))));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const taskTab =
    activeTab?.kind === "task" && activeTab.clusterName && activeTab.taskArn ? activeTab : null;

  return (
    <div className="flex flex-col bg-bg" style={{ height }}>
      <div
        onMouseDown={startResize}
        className="h-1 shrink-0 cursor-row-resize bg-border transition-colors hover:bg-accent"
        title="drag to resize"
      />
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
            title={p === "terminal" ? "ECS Exec terminal — not yet available" : undefined}
          >
            {p}
            {p === "terminal" && " ⋯"}
          </button>
        ))}
        <IconButton onClick={toggleDrawer} aria-label="close drawer" className="ml-auto">
          ✕
        </IconButton>
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
          <div className="p-3 text-fg-muted">ECS Exec session — not yet available.</div>
        )}
      </div>
    </div>
  );
}
