import { useMemo, useState } from "react";
import { useAlbMetrics, useClusterMetrics, useServiceMetrics } from "@/features/metrics/api";
import { useClusterResources, useScopeGraph } from "@/features/discovery/api";
import { MetricChart } from "@/features/metrics/components/MetricChart";
import { LoadingState, EmptyState } from "@/components/ui/StateView";
import type { MetricSeries, Scope } from "@/types";

const RANGES: { label: string; secs: number }[] = [
  { label: "1h", secs: 3600 },
  { label: "6h", secs: 21600 },
  { label: "24h", secs: 86400 },
  { label: "7d", secs: 604800 },
];

function useContainerInsights(scope: Scope, cluster: string): boolean {
  const graph = useScopeGraph(scope);
  const setting = graph?.clusters.find((c) => c.name === cluster)?.settings.containerInsights;
  return !!setting && setting !== "disabled";
}

function RangeSelect({ value, onChange }: { value: number; onChange: (secs: number) => void }) {
  return (
    <div className="flex items-center gap-1 px-4 pt-3 text-[11px]">
      <span className="mr-1 text-fg-muted">range</span>
      {RANGES.map((r) => (
        <button
          key={r.secs}
          type="button"
          onClick={() => onChange(r.secs)}
          className={`rounded px-2 py-0.5 ${
            value === r.secs ? "bg-bg-elev-2 text-fg" : "text-fg-muted hover:text-fg-dim"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function Grid({
  series,
  isLoading,
  markers = [],
}: {
  series: MetricSeries[];
  isLoading: boolean;
  markers?: { ts: number; label: string }[];
}) {
  if (isLoading && series.length === 0) {
    return <LoadingState label="loading metrics…" />;
  }
  if (series.length === 0) {
    return <EmptyState label="no metric data in the window" />;
  }
  return (
    <div className="grid grid-cols-1 gap-6 p-4 xl:grid-cols-2">
      {series.map((s) => (
        <div key={s.metricName || s.label} className="rounded border border-border p-2">
          <MetricChart series={s} markers={markers} />
        </div>
      ))}
    </div>
  );
}

export function ServiceMetrics({
  scope,
  cluster,
  service,
  targetGroupArn,
}: {
  scope: Scope;
  cluster: string;
  service: string;
  targetGroupArn?: string;
}) {
  const insights = useContainerInsights(scope, cluster);
  const [rangeSecs, setRangeSecs] = useState(3600);
  const { data, isLoading } = useServiceMetrics(scope, cluster, service, insights, rangeSecs);
  const alb = useAlbMetrics(scope, targetGroupArn, rangeSecs);

  // Overlay the service's deployments so a metric shift lines up with a rollout.
  const { data: resources } = useClusterResources(scope, cluster);
  const svc = resources?.services.find((s) => s.name === service);
  const markers = useMemo(
    () =>
      (svc?.deployments ?? [])
        .filter((d) => d.createdAt)
        .map((d) => ({
          ts: Date.parse(d.createdAt as string) / 1000,
          label: `td:${d.taskDef.split(":").pop() ?? ""}`,
        })),
    [svc],
  );

  return (
    <div className="flex flex-col">
      <RangeSelect value={rangeSecs} onChange={setRangeSecs} />
      {markers.length > 0 && (
        <div className="px-4 pt-1 text-[11px] text-fg-muted">
          deploys:{" "}
          {markers
            .map(
              (m) =>
                `${m.label} @ ${new Date(m.ts * 1000).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`,
            )
            .join(" · ")}
        </div>
      )}
      <Grid series={data ?? []} isLoading={isLoading} markers={markers} />
      {targetGroupArn && (
        <>
          <div className="px-4 pt-2 text-[11px] uppercase tracking-wide text-fg-muted">
            load balancer
          </div>
          <Grid series={alb.data ?? []} isLoading={alb.isLoading} markers={markers} />
        </>
      )}
    </div>
  );
}

export function ClusterMetrics({ scope, cluster }: { scope: Scope; cluster: string }) {
  const insights = useContainerInsights(scope, cluster);
  const [rangeSecs, setRangeSecs] = useState(3600);
  const { data, isLoading } = useClusterMetrics(scope, cluster, insights, rangeSecs);
  return (
    <div className="flex flex-col">
      <RangeSelect value={rangeSecs} onChange={setRangeSecs} />
      <Grid series={data ?? []} isLoading={isLoading} />
    </div>
  );
}
