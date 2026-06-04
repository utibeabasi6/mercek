import { useEffect, useState } from "react";
import type { Tab } from "@/app/shell";
import { useClusterResources, useScopeGraph } from "@/features/discovery/api";
import { SubTabs, Field, Section } from "@/components/ui/Tabs";
import { StatusBadge, Count } from "@/components/ui/Badge";
import { LoadingState, EmptyState } from "@/components/ui/StateView";
import { ClusterMetrics } from "@/features/metrics/components/MetricsView";
import { ObservationsSection } from "@/features/sentinel/components/ObservationsSection";
import { TopologyView } from "@/features/topology/TopologyView";
import { RunTaskDialog } from "@/features/tasks/components/RunTaskDialog";
import { CreateServiceDialog } from "@/features/services/components/CreateServiceDialog";
import { OpenInAwsButton } from "@/components/ui/OpenInAwsButton";
import { awsConsole } from "@/lib/aws-console";
import { shortAccount } from "@/lib/arn";

export function ClusterDetail({ tab }: { tab: Tab }) {
  const graph = useScopeGraph(tab.scope);
  const { data: resources, isLoading } = useClusterResources(
    tab.scope,
    tab.clusterName ?? "",
    true,
    true,
  );
  const cluster = graph?.clusters.find((c) => c.name === tab.clusterName) ?? null;
  const [sub, setSub] = useState(tab.section ?? "overview");
  const [running, setRunning] = useState(false);
  const [creatingService, setCreatingService] = useState(false);
  useEffect(() => {
    if (tab.section) setSub(tab.section);
  }, [tab.section, tab.focusId]);

  if (!graph) return <LoadingState label="loading scope…" />;
  if (!cluster) return <EmptyState label={`cluster ${tab.label} is not in this scope`} />;

  const services = resources?.services ?? [];
  const insightsOff = cluster.settings.containerInsights === "disabled";
  const instances = resources?.containerInstances ?? [];
  const providerOf = (name: string) => graph.capacityProviders.find((p) => p.name === name);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <h2 className="min-w-0 truncate text-fg">{cluster.name}</h2>
        <StatusBadge status={cluster.status} />
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setCreatingService(true)}
            className="shrink-0 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            create service
          </button>
          <button
            type="button"
            onClick={() => setRunning(true)}
            className="shrink-0 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
          >
            run task
          </button>
          <OpenInAwsButton url={awsConsole.cluster(graph.scope.region, cluster.name)} />
          <span className="shrink-0 whitespace-nowrap text-[12px] text-fg-muted">
            {shortAccount(graph.accountId)} · {graph.scope.region}
          </span>
        </div>
      </header>

      {running && (
        <RunTaskDialog scope={graph.scope} cluster={cluster.name} onClose={() => setRunning(false)} />
      )}

      {creatingService && (
        <CreateServiceDialog
          scope={graph.scope}
          cluster={cluster.name}
          onClose={() => setCreatingService(false)}
        />
      )}

      <SubTabs
        tabs={[
          { id: "overview", label: "overview" },
          { id: "metrics", label: "metrics" },
          { id: "topology", label: "topology" },
        ]}
        active={sub}
        onChange={setSub}
      />

      {sub === "overview" && (
        <div className="flex flex-col gap-6 overflow-auto p-4">
          <div className="flex gap-6">
            <Count label="services" value={cluster.stats.activeServices} />
            <Count label="running" value={cluster.stats.runningTasks} tone="ok" />
            <Count
              label="pending"
              value={cluster.stats.pendingTasks}
              tone={cluster.stats.pendingTasks > 0 ? "warn" : undefined}
            />
            <Count label="container instances" value={cluster.stats.containerInstances} />
          </div>

          <ObservationsSection scope={graph.scope} cluster={cluster.name} />

          <Section title="capacity providers">
            <div className="flex max-w-2xl flex-col">
              {cluster.capacityProviders.map((name) => {
                const p = providerOf(name);
                return (
                  <div
                    key={name}
                    className="flex items-center gap-3 border-t border-border py-1.5"
                  >
                    <span className="w-56 truncate text-fg">{name}</span>
                    <span className="text-fg-dim">{p?.kind ?? "—"}</span>
                    {p && <span className="ml-auto"><StatusBadge status={p.status} /></span>}
                  </div>
                );
              })}
              {cluster.capacityProviders.length === 0 && (
                <span className="text-fg-muted">none</span>
              )}
            </div>
          </Section>

          <Section title="default strategy">
            <table className="w-full max-w-2xl text-left">
              <thead className="text-[11px] uppercase text-fg-muted">
                <tr>
                  <th className="py-1 font-normal">provider</th>
                  <th className="py-1 font-normal">base</th>
                  <th className="py-1 font-normal">weight</th>
                </tr>
              </thead>
              <tbody>
                {cluster.defaultStrategy.map((s) => (
                  <tr key={s.capacityProvider} className="border-t border-border">
                    <td className="py-1 text-fg">{s.capacityProvider}</td>
                    <td className="py-1 tabular-nums text-fg-dim">{s.base}</td>
                    <td className="py-1 tabular-nums text-fg-dim">{s.weight}</td>
                  </tr>
                ))}
                {cluster.defaultStrategy.length === 0 && (
                  <tr>
                    <td className="py-1 text-fg-muted" colSpan={3}>
                      none
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Section>

          <Section title="container instances">
            {isLoading ? (
              <div className="text-fg-muted">loading…</div>
            ) : instances.length === 0 ? (
              <div className="text-fg-muted">none (Fargate launch type)</div>
            ) : (
              <div className="flex flex-col">
                {instances.map((ci) => (
                  <div
                    key={ci.arn}
                    className="flex items-center gap-3 border-t border-border py-1.5"
                  >
                    <span className="w-56 truncate text-fg">{ci.ec2InstanceId ?? "—"}</span>
                    <StatusBadge status={ci.status} />
                    <span className="text-fg-dim">{ci.agentConnected ? "agent ✓" : "agent ✕"}</span>
                    <span className="ml-auto tabular-nums text-fg-dim">
                      {ci.runningTasksCount} running
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="settings">
            <Field label="container insights">
              {cluster.settings.containerInsights || "disabled"}
            </Field>
            {insightsOff && (
              <div className="max-w-2xl rounded border border-border bg-bg-elev px-3 py-2 text-[12px] text-fg-dim">
                Container Insights off — limited metrics; enable for per-task detail.
              </div>
            )}
          </Section>

          <Section title="services">
            {isLoading ? (
              <div className="text-fg-muted">loading…</div>
            ) : (
              <div className="flex flex-col">
                {services.map((s) => (
                  <div
                    key={s.arn}
                    className="flex items-center gap-3 border-t border-border py-1.5"
                  >
                    <span className="w-40 truncate text-fg">{s.name}</span>
                    <StatusBadge status={s.status} />
                    <span className="ml-auto tabular-nums text-fg-dim">
                      {s.running}/{s.desired}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {sub === "metrics" && <ClusterMetrics scope={graph.scope} cluster={cluster.name} />}

      {sub === "topology" && (
        <div className="min-h-0 flex-1">
          <TopologyView scope={graph.scope} cluster={cluster.name} />
        </div>
      )}
    </div>
  );
}
