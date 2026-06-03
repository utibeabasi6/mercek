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
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/StateView";
import { InvestigateButton } from "@/features/agent/components/InvestigateButton";
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
import { RollbackDialog } from "@/features/services/components/RollbackDialog";
import { CompareServiceDialog } from "@/features/services/components/CompareServiceDialog";
import { ServiceMetrics } from "@/features/metrics/components/MetricsView";
import { RightSizingPanel } from "@/features/metrics/components/RightSizingPanel";
import { toneFor } from "@/lib/status";
import { relativeTime } from "@/lib/format";
import { appErrorMessage } from "@/lib/errors";
import { taskDefShort, arnName } from "@/lib/arn";
import type { AppError } from "@/types";

export function ServiceDetail({ tab }: { tab: Tab }) {
  const { data: resources, isLoading, isError, error, refetch } = useClusterResources(
    tab.scope,
    tab.clusterName ?? "",
    true,
    true,
  );
  const service = resources?.services.find((s) => s.name === tab.serviceName) ?? null;
  const [sub, setSub] = useState(tab.section ?? "overview");
  const [scaling, setScaling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [rollbackTo, setRollbackTo] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const forceDeploy = useForceDeploy(tab.scope, tab.clusterName ?? "");
  const { openTab, askAgent } = useShell();
  const focusRef = useRef<HTMLDivElement | null>(null);

  // An agent "navigate" can re-point this tab's section/focus while it's open.
  useEffect(() => {
    if (tab.section) setSub(tab.section);
  }, [tab.section, tab.focusId]);
  useEffect(() => {
    if (sub === "deployments" && tab.focusId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [sub, tab.focusId, service]);

  if (!service) {
    if (isLoading) return <LoadingState label="loading service…" />;
    if (isError) {
      return (
        <ErrorState
          title="couldn't load this service"
          detail={appErrorMessage(error as unknown as AppError)}
          onRetry={() => void refetch()}
        />
      );
    }
    return <EmptyState label={`service ${tab.label} not found in ${tab.clusterName}`} />;
  }

  const tasks = resources?.tasks.filter((t) => t.service === service.name) ?? [];
  const deploying = service.deployments.some((d) => d.rolloutState === "in_progress");
  const awsvpc = service.networkConfiguration?.awsvpcConfiguration ?? null;
  // Unhealthy/stuck: a failed rollout, not enough running, or tasks stuck pending.
  const unhealthy =
    service.deployments.some((d) => d.rolloutState === "failed") ||
    service.running < service.desired ||
    service.pending > 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <h2 className="min-w-0 truncate text-fg">{service.name}</h2>
        <StatusBadge status={service.status} tone={deploying ? "warn" : undefined} />
        <span className="shrink-0 text-[12px] text-fg-muted">{service.cluster}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {unhealthy && (
            <InvestigateButton
              title="diagnose why this service is unhealthy"
              message={`Investigate why service ${service.name} in cluster ${service.cluster} is unhealthy (running ${service.running}/${service.desired}, pending ${service.pending}). Correlate the deployment/rollout state, the service events feed, and any failing tasks' stop reasons + exit codes + recent logs, then give me the root cause and a fix.`}
            />
          )}
          <button
            type="button"
            onClick={() => setScaling(true)}
            className="shrink-0 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            scale
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeploy(true)}
            className="shrink-0 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            force deploy
          </button>
          <button
            type="button"
            onClick={() => setUpdating(true)}
            className="shrink-0 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            update
          </button>
          <button
            type="button"
            onClick={() => setComparing(true)}
            title="diff against another env/region"
            className="shrink-0 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            compare
          </button>
        </div>
      </header>

      {scaling && (
        <ScaleDialog scope={tab.scope} service={service} onClose={() => setScaling(false)} />
      )}

      {updating && (
        <UpdateDialog scope={tab.scope} service={service} onClose={() => setUpdating(false)} />
      )}

      {rollbackTo && (
        <RollbackDialog
          scope={tab.scope}
          service={service}
          targetTaskDef={rollbackTo}
          onClose={() => setRollbackTo(null)}
        />
      )}

      {comparing && (
        <CompareServiceDialog
          scope={tab.scope}
          service={service}
          onClose={() => setComparing(false)}
        />
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
          { id: "sizing", label: "sizing" },
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
          <div className="flex flex-col gap-3">
            {(() => {
              const cb = service.deploymentConfiguration?.deploymentCircuitBreaker;
              const failed = service.deployments.some((d) => d.rolloutState === "failed");
              return (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
                  <span>
                    <span className="text-fg-muted">circuit breaker </span>
                    <span className={cb?.enable ? "text-fg" : "text-fg-muted"}>
                      {cb?.enable ? `on${cb.rollback ? " + auto-rollback" : ""}` : "off"}
                    </span>
                  </span>
                  <span>
                    <span className="text-fg-muted">min/max % </span>
                    <span className="tabular-nums text-fg-dim">
                      {service.deploymentConfiguration?.minimumHealthyPercent ?? "—"} /{" "}
                      {service.deploymentConfiguration?.maximumPercent ?? "—"}
                    </span>
                  </span>
                  {failed && <span className="text-err">rollout failed — see reason below</span>}
                </div>
              );
            })()}

            <div className="flex flex-col">
              {service.deployments.map((d) => {
                const focused = d.id === tab.focusId;
                const isCurrent = d.taskDef === service.taskDefArn;
                const tone =
                  d.rolloutState === "failed"
                    ? "err"
                    : d.rolloutState === "in_progress"
                      ? "warn"
                      : "ok";
                return (
                  <div
                    key={d.id}
                    ref={focused ? focusRef : undefined}
                    className={`border-b border-border py-2 ${
                      focused ? "rounded bg-bg-elev px-2 ring-1 ring-accent" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <StatusGlyph tone={tone} />
                      <span className="w-16 text-fg">{d.status}</span>
                      <span className="text-fg-dim">{taskDefShort(d.taskDef)}</span>
                      {isCurrent && <span className="text-[11px] text-accent">current</span>}
                      {d.failedTasks > 0 && (
                        <span className="text-[11px] text-err">{d.failedTasks} failed</span>
                      )}
                      <span className="ml-auto tabular-nums text-fg-dim">
                        {d.running}/{d.desired}
                        {d.pending > 0 ? ` (+${d.pending})` : ""}
                      </span>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => setRollbackTo(d.taskDef)}
                          title={`roll back to ${taskDefShort(d.taskDef)}`}
                          className="rounded border border-border px-2 py-0.5 text-[11px] text-fg-dim hover:border-accent hover:text-accent"
                        >
                          roll back
                        </button>
                      )}
                      <span className="w-24 text-right text-fg-muted">
                        {relativeTime(d.createdAt)}
                      </span>
                    </div>
                    {d.rolloutStateReason && (
                      <div
                        className={`mt-1 pl-6 text-[11px] ${
                          tone === "err" ? "text-err" : "text-fg-muted"
                        }`}
                      >
                        {d.rolloutStateReason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sub === "events" && (
          <div className="flex flex-col gap-1">
            {service.events.map((e, i) => (
              <div key={e.id} className="group flex gap-3 border-b border-border py-1.5">
                <span className="w-24 shrink-0 text-fg-muted">{relativeTime(e.createdAt)}</span>
                <span className="min-w-0 flex-1 text-fg-dim">{e.message}</span>
                <button
                  type="button"
                  title="ask the agent to investigate around this event"
                  onClick={() => {
                    const from = Math.max(0, i - 10);
                    const window = service.events
                      .slice(from, i + 11)
                      .map(
                        (ev, j) =>
                          `${from + j === i ? "» " : "  "}${ev.createdAt} ${ev.message}`,
                      )
                      .join("\n");
                    askAgent(
                      `Investigate this service-events window for ${service.name} in cluster ${service.cluster}. The line marked » is the one I'm asking about. Correlate with the deployment/rollout state, failing tasks (stop reasons + exit codes), target health, and recent logs, then tell me the root cause and a fix.\n\n\`\`\`\n${window}\n\`\`\``,
                    );
                  }}
                  className="shrink-0 self-start text-accent opacity-0 transition-opacity group-hover:opacity-100"
                >
                  ✨
                </button>
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

        {sub === "sizing" && (
          <RightSizingPanel scope={tab.scope} cluster={service.cluster} service={service} />
        )}
      </div>
    </div>
  );
}
