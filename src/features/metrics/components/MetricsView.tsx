import { useAlbMetrics, useClusterMetrics, useServiceMetrics } from "@/features/metrics/api";
import { useScopeGraph } from "@/features/discovery/api";
import { MetricChart } from "@/features/metrics/components/MetricChart";
import type { MetricSeries, Scope } from "@/types";

function useContainerInsights(scope: Scope, cluster: string): boolean {
  const graph = useScopeGraph(scope);
  const setting = graph?.clusters.find((c) => c.name === cluster)?.settings.containerInsights;
  return !!setting && setting !== "disabled";
}

function Grid({ series, isLoading }: { series: MetricSeries[]; isLoading: boolean }) {
  if (isLoading && series.length === 0) {
    return <div className="p-4 text-fg-muted">loading metrics…</div>;
  }
  if (series.length === 0) {
    return <div className="p-4 text-fg-muted">no metric data in the window</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-6 p-4 xl:grid-cols-2">
      {series.map((s) => (
        <div key={s.metricName || s.label} className="rounded border border-border p-2">
          <MetricChart series={s} />
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
  const { data, isLoading } = useServiceMetrics(scope, cluster, service, insights);
  const alb = useAlbMetrics(scope, targetGroupArn);
  return (
    <div className="flex flex-col">
      <Grid series={data ?? []} isLoading={isLoading} />
      {targetGroupArn && (
        <>
          <div className="px-4 pt-2 text-[11px] uppercase tracking-wide text-fg-muted">
            load balancer
          </div>
          <Grid series={alb.data ?? []} isLoading={alb.isLoading} />
        </>
      )}
    </div>
  );
}

export function ClusterMetrics({ scope, cluster }: { scope: Scope; cluster: string }) {
  const insights = useContainerInsights(scope, cluster);
  const { data, isLoading } = useClusterMetrics(scope, cluster, insights);
  return <Grid series={data ?? []} isLoading={isLoading} />;
}
