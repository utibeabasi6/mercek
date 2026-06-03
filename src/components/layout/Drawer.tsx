import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useShell, type Tab } from "@/app/shell";
import { useClusterResources } from "@/features/discovery/api";
import { LogTailPanel } from "@/features/logs/components/LogTailPanel";
import type { Task } from "@/types";

const PANELS = ["logs", "events", "terminal"] as const;
type Panel = (typeof PANELS)[number];

// The latest task to tail logs from for the open resource: the task itself, or —
// for a service/cluster — its most recent RUNNING task (falling back to any).
function latestTaskArn(tab: Tab, tasks: Task[]): string | null {
  if (tab.kind === "task") return tab.taskArn ?? null;
  const pool = tab.kind === "service" ? tasks.filter((t) => t.service === tab.serviceName) : tasks;
  const sorted = [...pool].sort((a, b) => {
    const running = Number(b.lastStatus === "RUNNING") - Number(a.lastStatus === "RUNNING");
    return running !== 0 ? running : (b.startedAt ?? "").localeCompare(a.startedAt ?? "");
  });
  return sorted[0]?.arn ?? null;
}

// Logs are per-task; this resolves a task even when you're on a service or cluster
// (picks the latest), so opening the drawer "just works" from anywhere.
function LogsPanel({ tab }: { tab: Tab | null }) {
  const needResolve = !!tab && tab.kind !== "task" && !!tab.clusterName;
  const { data: resources } = useClusterResources(
    tab?.scope ?? { profile: "", region: "" },
    tab?.clusterName ?? "",
    needResolve,
    false,
  );
  if (!tab || !tab.clusterName) {
    return <div className="p-3 text-fg-muted">open a cluster, service, or task to tail logs</div>;
  }
  const taskArn = latestTaskArn(tab, resources?.tasks ?? []);
  if (!taskArn) {
    return <div className="p-3 text-fg-muted">no running tasks to tail logs from yet</div>;
  }
  return <LogTailPanel key={taskArn} scope={tab.scope} cluster={tab.clusterName} taskArn={taskArn} />;
}

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
          <X />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1">
        {panel === "logs" && <LogsPanel tab={activeTab} />}
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
