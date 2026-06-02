import { useClusterMetrics, useServiceMetrics } from "@/features/metrics/api";
import { MetricChart } from "@/features/metrics/components/MetricChart";
import type { MetricSeries, Scope } from "@/types";

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
}: {
  scope: Scope;
  cluster: string;
  service: string;
}) {
  const { data, isLoading } = useServiceMetrics(scope, cluster, service);
  return <Grid series={data ?? []} isLoading={isLoading} />;
}

export function ClusterMetrics({ scope, cluster }: { scope: Scope; cluster: string }) {
  const { data, isLoading } = useClusterMetrics(scope, cluster);
  return <Grid series={data ?? []} isLoading={isLoading} />;
}
