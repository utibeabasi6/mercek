import { useShell } from "@/app/shell";
import { TabBar } from "@/components/layout/TabBar";
import { ClusterDetail } from "@/features/clusters/components/ClusterDetail";
import { ServiceDetail } from "@/features/services/components/ServiceDetail";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { modLabel } from "@/app/keybindings";
import { Kbd } from "@/components/ui/Badge";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-fg-muted">
      <div className="text-fg-dim">mercek</div>
      <div className="flex flex-col items-center gap-1 text-[12px]">
        <div>Activate a profile in the left rail, then open a resource.</div>
        <div className="flex items-center gap-2">
          <Kbd>{modLabel} K</Kbd> commands
          <Kbd>{modLabel} P</Kbd> go to resource
        </div>
      </div>
    </div>
  );
}

export function Workspace() {
  const { activeTab } = useShell();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TabBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        {!activeTab && <EmptyState />}
        {activeTab?.kind === "cluster" && <ClusterDetail key={activeTab.id} tab={activeTab} />}
        {activeTab?.kind === "service" && <ServiceDetail key={activeTab.id} tab={activeTab} />}
        {activeTab?.kind === "task" && <TaskDetail key={activeTab.id} tab={activeTab} />}
      </div>
    </div>
  );
}
