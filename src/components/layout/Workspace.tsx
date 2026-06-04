import { useShell } from "@/app/shell";
import { TabBar } from "@/components/layout/TabBar";
import { ClusterDetail } from "@/features/clusters/components/ClusterDetail";
import { ServiceDetail } from "@/features/services/components/ServiceDetail";
import { TaskDetail } from "@/features/tasks/components/TaskDetail";
import { OverviewDashboard } from "@/features/overview/components/OverviewDashboard";

export function Workspace() {
  const { activeTab } = useShell();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TabBar />
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* No active tab → the multi-cluster Overview is the home view. */}
        {!activeTab && <OverviewDashboard />}
        {activeTab?.kind === "cluster" && <ClusterDetail key={activeTab.id} tab={activeTab} />}
        {activeTab?.kind === "service" && <ServiceDetail key={activeTab.id} tab={activeTab} />}
        {activeTab?.kind === "task" && <TaskDetail key={activeTab.id} tab={activeTab} />}
      </div>
    </div>
  );
}
