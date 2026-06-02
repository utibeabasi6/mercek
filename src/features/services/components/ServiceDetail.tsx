import { useState } from "react";
import type { Tab } from "@/app/shell";
import { useClusterResources } from "@/features/discovery/api";
import { SubTabs, Field } from "@/components/ui/Tabs";
import { StatusBadge, StatusGlyph, Count } from "@/components/ui/Badge";
import { TargetsPanel } from "@/features/services/components/TargetsPanel";
import { ScalingPanel } from "@/features/services/components/ScalingPanel";
import { ServiceMetrics } from "@/features/metrics/components/MetricsView";
import { toneFor } from "@/lib/status";
import { relativeTime } from "@/lib/format";
import { taskDefShort, arnName } from "@/lib/arn";

const ACTIONS = ["scale", "update", "force deploy"];

export function ServiceDetail({ tab }: { tab: Tab }) {
  const { data: resources, isLoading } = useClusterResources(tab.scope, tab.clusterName ?? "");
  const service = resources?.services.find((s) => s.name === tab.serviceName) ?? null;
  const [sub, setSub] = useState("overview");

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
          {ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              disabled
              title="write paths land in Phase 2"
              className="cursor-not-allowed rounded border border-border px-2 py-1 text-fg-muted opacity-70"
            >
              {a}
            </button>
          ))}
        </div>
      </header>

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

      <div className="flex-1 overflow-auto p-4">
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
            {service.deployments.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border py-2">
                <StatusGlyph tone={d.rolloutState === "in_progress" ? "warn" : "ok"} />
                <span className="w-20 text-fg">{d.status}</span>
                <span className="text-fg-dim">{taskDefShort(d.taskDef)}</span>
                <span className="ml-auto tabular-nums text-fg-dim">
                  {d.running}/{d.desired}
                </span>
                <span className="w-24 text-right text-fg-muted">{relativeTime(d.createdAt)}</span>
              </div>
            ))}
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
          <table className="w-full text-left">
            <thead className="text-[11px] uppercase text-fg-muted">
              <tr>
                <th className="py-1 font-normal">task</th>
                <th className="py-1 font-normal">status</th>
                <th className="py-1 font-normal">health</th>
                <th className="py-1 font-normal">cpu</th>
                <th className="py-1 font-normal">memory</th>
                <th className="py-1 font-normal">started</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.arn} className="border-t border-border">
                  <td className="py-1 text-fg">{arnName(t.arn).slice(0, 12)}</td>
                  <td className="py-1">
                    <StatusBadge status={t.lastStatus} tone={toneFor(t.lastStatus)} />
                  </td>
                  <td className="py-1 text-fg-dim">{t.health}</td>
                  <td className="py-1 tabular-nums text-fg-dim">{t.cpu ?? "—"}</td>
                  <td className="py-1 tabular-nums text-fg-dim">{t.memory ?? "—"}</td>
                  <td className="py-1 text-fg-muted">{relativeTime(t.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {sub === "targets" && <TargetsPanel scope={tab.scope} service={service} />}

        {sub === "scaling" && (
          <ScalingPanel scope={tab.scope} cluster={service.cluster} service={service.name} />
        )}

        {sub === "metrics" && (
          <ServiceMetrics scope={tab.scope} cluster={service.cluster} service={service.name} />
        )}
      </div>
    </div>
  );
}
