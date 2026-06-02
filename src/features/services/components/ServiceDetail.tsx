import { useEffect, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useShell, type Tab } from "@/app/shell";
import { useClusterResources } from "@/features/discovery/api";
import { taskTab } from "@/features/discovery/tabs";
import { useForceDeploy } from "@/features/services/api";
import { SubTabs, Field } from "@/components/ui/Tabs";
import { StatusBadge, StatusGlyph, Count } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import type { Task } from "@/types";

const taskColumns: ColumnDef<Task, unknown>[] = [
  {
    id: "task",
    header: "task",
    accessorFn: (t) => arnName(t.arn).slice(0, 12),
    cell: (c) => <span className="text-accent">{c.getValue<string>()}</span>,
  },
  {
    id: "status",
    header: "status",
    accessorFn: (t) => t.lastStatus,
    cell: (c) => <StatusBadge status={c.getValue<string>()} tone={toneFor(c.getValue<string>())} />,
  },
  { id: "health", header: "health", accessorFn: (t) => t.health },
  { id: "cpu", header: "cpu", accessorFn: (t) => t.cpu ?? "—" },
  { id: "memory", header: "memory", accessorFn: (t) => t.memory ?? "—" },
  {
    id: "started",
    header: "started",
    accessorFn: (t) => t.startedAt ?? "",
    cell: (c) => (
      <span className="text-fg-muted">{relativeTime(c.getValue<string>() || null)}</span>
    ),
  },
];
import { TargetsPanel } from "@/features/services/components/TargetsPanel";
import { ScalingPanel } from "@/features/services/components/ScalingPanel";
import { ScaleDialog } from "@/features/services/components/ScaleDialog";
import { UpdateDialog } from "@/features/services/components/UpdateDialog";
import { ServiceMetrics } from "@/features/metrics/components/MetricsView";
import { toneFor } from "@/lib/status";
import { relativeTime } from "@/lib/format";
import { appErrorMessage } from "@/lib/errors";
import { taskDefShort, arnName } from "@/lib/arn";
import type { AppError } from "@/types";

export function ServiceDetail({ tab }: { tab: Tab }) {
  const { data: resources, isLoading } = useClusterResources(tab.scope, tab.clusterName ?? "", true, true);
  const service = resources?.services.find((s) => s.name === tab.serviceName) ?? null;
  const [sub, setSub] = useState(tab.section ?? "overview");
  const [scaling, setScaling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const forceDeploy = useForceDeploy(tab.scope, tab.clusterName ?? "");
  const { openTab } = useShell();
  const focusRef = useRef<HTMLDivElement | null>(null);

  // An agent "navigate" can re-point this tab's section/focus while it's open (§6).
  useEffect(() => {
    if (tab.section) setSub(tab.section);
  }, [tab.section, tab.focusId]);
  useEffect(() => {
    if (sub === "deployments" && tab.focusId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [sub, tab.focusId, service]);

  if (!service) {
    return (
      <div className="p-6 text-fg-muted">
        {isLoading ? "loading service…" : `service ${tab.label} not found`}
      </div>
    );
  }

  const tasks = resources?.tasks.filter((t) => t.service === service.name) ?? [];
  const deploying = service.deployments.some((d) => d.rolloutState === "in_progress");
  const awsvpc = service.networkConfiguration?.awsvpcConfiguration ?? null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 py-3">
        <h2 className="text-fg">{service.name}</h2>
        <StatusBadge status={service.status} tone={deploying ? "warn" : undefined} />
        <span className="text-[12px] text-fg-muted">{service.cluster}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScaling(true)}
            className="rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            scale
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeploy(true)}
            className="rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            force deploy
          </button>
          <button
            type="button"
            onClick={() => setUpdating(true)}
            className="rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            update
          </button>
        </div>
      </header>

      {scaling && (
        <ScaleDialog scope={tab.scope} service={service} onClose={() => setScaling(false)} />
      )}

      {updating && (
        <UpdateDialog scope={tab.scope} service={service} onClose={() => setUpdating(false)} />
      )}

      {confirmDeploy && (
        <ConfirmDialog
          title={
            <>
              force new deployment of <span className="text-accent">{service.name}</span>
            </>
          }
          confirmLabel="force deploy"
          busy={forceDeploy.isPending}
          errorMessage={
            forceDeploy.isError ? appErrorMessage(forceDeploy.error as unknown as AppError) : undefined
          }
          onConfirm={() =>
            forceDeploy.mutate(service.name, { onSuccess: () => setConfirmDeploy(false) })
          }
          onClose={() => setConfirmDeploy(false)}
        >
          Rolling-restart all {service.running} task(s) using the current task definition (
          {taskDefShort(service.taskDefArn)}). Tasks are replaced per the deployment configuration.
        </ConfirmDialog>
      )}

      <SubTabs
        tabs={[
          { id: "overview", label: "overview" },
          { id: "deployments", label: "deployments" },
          { id: "events", label: "events" },
          { id: "tasks", label: `tasks (${tasks.length})` },
          { id: "targets", label: "targets" },
          { id: "scaling", label: "scaling" },
          { id: "metrics", label: "metrics" },
        ]}
        active={sub}
        onChange={setSub}
      />

      <div
        className={`flex-1 p-4 ${
          sub === "tasks" ? "flex min-h-0 flex-col" : "overflow-auto"
        }`}
      >
        {sub === "overview" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-6">
              <Count label="desired" value={service.desired} />
              <Count label="running" value={service.running} tone="ok" />
              <Count
                label="pending"
                value={service.pending}
                tone={service.pending > 0 ? "warn" : undefined}
              />
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <Field label="rollout">
                <span className={deploying ? "text-warn" : "text-ok"}>
                  {deploying ? "IN_PROGRESS" : "COMPLETED"}
                </span>
              </Field>
              <Field label="launch type">{service.launchType ?? "—"}</Field>
              <Field label="platform">{service.platformVersion ?? "—"}</Field>
              <Field label="scheduling">{service.schedulingStrategy ?? "—"}</Field>
              <Field label="controller">{service.deploymentController?.kind ?? "—"}</Field>
              <Field label="task definition">{taskDefShort(service.taskDefArn)}</Field>
              <Field label="min / max healthy %">
                {service.deploymentConfiguration
                  ? `${service.deploymentConfiguration.minimumHealthyPercent ?? "—"} / ${
                      service.deploymentConfiguration.maximumPercent ?? "—"
                    }`
                  : "—"}
              </Field>
              <Field label="execute command">
                {service.enableExecuteCommand ? "enabled" : "disabled"}
              </Field>
              <Field label="load balancers">{service.loadBalancers.length || "none"}</Field>
            </div>
            {awsvpc && (
              <div className="flex flex-wrap gap-x-10 gap-y-4">
                <Field label="subnets">{awsvpc.subnets.join(", ") || "—"}</Field>
                <Field label="security groups">{awsvpc.securityGroups.join(", ") || "—"}</Field>
                <Field label="public ip">{awsvpc.assignPublicIp ?? "—"}</Field>
              </div>
            )}
          </div>
        )}

        {sub === "deployments" && (
          <div className="flex flex-col">
            {service.deployments.map((d) => {
              const focused = d.id === tab.focusId;
              return (
                <div
                  key={d.id}
                  ref={focused ? focusRef : undefined}
                  className={`flex items-center gap-3 border-b border-border py-2 ${
                    focused ? "rounded bg-bg-elev px-2 ring-1 ring-accent" : ""
                  }`}
                >
                  <StatusGlyph tone={d.rolloutState === "in_progress" ? "warn" : "ok"} />
                  <span className="w-20 text-fg">{d.status}</span>
                  <span className="text-fg-dim">{taskDefShort(d.taskDef)}</span>
                  <span className="ml-auto tabular-nums text-fg-dim">
                    {d.running}/{d.desired}
                  </span>
                  <span className="w-24 text-right text-fg-muted">{relativeTime(d.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}

        {sub === "events" && (
          <div className="flex flex-col gap-1">
            {service.events.map((e) => (
              <div key={e.id} className="flex gap-3 border-b border-border py-1.5">
                <span className="w-24 shrink-0 text-fg-muted">{relativeTime(e.createdAt)}</span>
                <span className="text-fg-dim">{e.message}</span>
              </div>
            ))}
          </div>
        )}

        {sub === "tasks" && (
          <DataTable
            data={tasks}
            columns={taskColumns}
            persistKey="service-tasks"
            getRowId={(t) => t.arn}
            onRowClick={(t) => openTab(taskTab(tab.scope, t))}
            exportName={`${service.name}-tasks`}
            filterPlaceholder="filter tasks…"
          />
        )}

        {sub === "targets" && <TargetsPanel scope={tab.scope} service={service} />}

        {sub === "scaling" && (
          <ScalingPanel scope={tab.scope} cluster={service.cluster} service={service.name} />
        )}

        {sub === "metrics" && (
          <ServiceMetrics
            scope={tab.scope}
            cluster={service.cluster}
            service={service.name}
            targetGroupArn={
              service.loadBalancers.find((lb) => lb.targetGroupArn)?.targetGroupArn ?? undefined
            }
          />
        )}
      </div>
    </div>
  );
}
