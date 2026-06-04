import { useScopeGraph, useTaskDefinition } from "@/features/discovery/api";
import { useServiceMetrics } from "@/features/metrics/api";
import { LoadingState } from "@/components/ui/StateView";
import type { MetricSeries, Scope, Service } from "@/types";

// Right-sizing: requested CPU/mem (task-def) vs observed utilization (metrics we
// already fetch) — "requested 2 vCPU, using 0.3". No new AWS API.

function stats(s?: MetricSeries): { avg: number; peak: number } | null {
  const vals = (s?.points ?? []).map((p) => p.value).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, peak: Math.max(...vals) };
}

function verdict(peakUtil: number | null): { label: string; cls: string } {
  if (peakUtil == null) return { label: "no data", cls: "text-fg-muted" };
  if (peakUtil < 40) return { label: "over-provisioned", cls: "text-warn" };
  if (peakUtil > 85) return { label: "under-provisioned", cls: "text-err" };
  return { label: "well-sized", cls: "text-ok" };
}

// Fargate hourly rates ($/vCPU-hr, $/GB-hr), on-demand. Region-approximate; used
// for an inline estimate (Fargate bills on the task's requested size).
const FARGATE_RATES: Record<string, { vcpu: number; gb: number }> = {
  "us-east-1": { vcpu: 0.04048, gb: 0.004445 },
  "us-east-2": { vcpu: 0.04048, gb: 0.004445 },
  "us-west-1": { vcpu: 0.04864, gb: 0.005344 },
  "us-west-2": { vcpu: 0.04048, gb: 0.004445 },
  "eu-west-1": { vcpu: 0.04456, gb: 0.00489 },
  "eu-central-1": { vcpu: 0.04656, gb: 0.00511 },
  "ap-southeast-1": { vcpu: 0.04691, gb: 0.00515 },
  "ap-south-1": { vcpu: 0.04048, gb: 0.004445 },
};
const usd = (n: number) =>
  n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

export function RightSizingPanel({
  scope,
  cluster,
  service,
}: {
  scope: Scope;
  cluster: string;
  service: Service;
}) {
  const graph = useScopeGraph(scope);
  const ciSetting = graph?.clusters.find((c) => c.name === cluster)?.settings.containerInsights;
  const insights = !!ciSetting && ciSetting !== "disabled";
  // Size from a week of data so the verdict reflects a representative peak, not a blip.
  const { data: metrics, isLoading } = useServiceMetrics(
    scope,
    cluster,
    service.name,
    insights,
    604800,
  );
  const { data: td } = useTaskDefinition(scope, service.taskDefArn);

  if (!td) return <LoadingState label="loading task definition…" />;

  // Requested: Fargate task-level cpu/memory (strings, cpu in 1024-units), else sum containers.
  const reqCpuUnits =
    Number(td.cpu) || td.containerDefs.reduce((a, c) => a + (c.cpu || 0), 0);
  const reqMiB = Number(td.memory) || td.containerDefs.reduce((a, c) => a + (c.memory ?? 0), 0);
  const reqVcpu = reqCpuUnits / 1024;

  const cpuSeries = metrics?.find(
    (s) => s.metricName === "CPUUtilization" || s.metricName === "CpuUtilized",
  );
  const memSeries = metrics?.find(
    (s) => s.metricName === "MemoryUtilization" || s.metricName === "MemoryUtilized",
  );
  const cpuStat = stats(cpuSeries);
  const memStat = stats(memSeries);

  // Normalize to used-amount + utilization%, whether the metric is % or units.
  const cpu = (() => {
    if (!cpuStat) return null;
    if (cpuSeries?.metricName === "CPUUtilization") {
      return { usedAvg: (reqVcpu * cpuStat.avg) / 100, utilAvg: cpuStat.avg, utilPeak: cpuStat.peak };
    }
    const usedAvg = cpuStat.avg / 1024;
    return {
      usedAvg,
      utilAvg: reqVcpu ? (usedAvg / reqVcpu) * 100 : 0,
      utilPeak: reqVcpu ? (cpuStat.peak / 1024 / reqVcpu) * 100 : 0,
    };
  })();
  const mem = (() => {
    if (!memStat) return null;
    if (memSeries?.metricName === "MemoryUtilization") {
      return { usedAvg: (reqMiB * memStat.avg) / 100, utilAvg: memStat.avg, utilPeak: memStat.peak };
    }
    return {
      usedAvg: memStat.avg,
      utilAvg: reqMiB ? (memStat.avg / reqMiB) * 100 : 0,
      utilPeak: reqMiB ? (memStat.peak / reqMiB) * 100 : 0,
    };
  })();

  // Inline Fargate cost estimate (per-task size × running count). EC2 launch type
  // bills per instance, not per task, so we don't estimate it here.
  const isFargate = service.launchType !== "EC2";
  const onSpot = service.deployments.some((d) =>
    d.capacityProviderStrategy.some((c) => c.capacityProvider === "FARGATE_SPOT"),
  );
  const rate = FARGATE_RATES[scope.region] ?? FARGATE_RATES["us-east-1"];
  const perTaskHr = reqVcpu * rate.vcpu + (reqMiB / 1024) * rate.gb;
  const perTaskMo = perTaskHr * 730;
  const perServiceMo = perTaskMo * service.running;

  const hasUtil = !!cpu || !!mem;

  return (
    <div className="flex flex-col gap-4 p-4">
      {isFargate && reqVcpu > 0 ? (
        <div className="rounded border border-border p-3">
          <div className="flex items-center gap-3">
            <span className="w-20 text-fg">cost</span>
            <span className="text-[11px] text-fg-muted">
              Fargate{onSpot ? " + Spot" : ""} estimate · {scope.region}
            </span>
            <span className="ml-auto text-[13px] tabular-nums text-fg">
              ~{usd(perServiceMo)}/mo
            </span>
          </div>
          <div className="mt-2 flex gap-8 text-[13px]">
            <span>
              <span className="text-fg-muted">per task </span>
              <span className="tabular-nums text-fg-dim">~{usd(perTaskMo)}/mo</span>
            </span>
            <span>
              <span className="text-fg-muted">× running </span>
              <span className="tabular-nums text-fg-dim">{service.running}</span>
            </span>
          </div>
          {onSpot && (
            <div className="mt-1 text-[11px] text-fg-muted">
              On-demand rate shown; Fargate Spot is typically ~70% lower.
            </div>
          )}
        </div>
      ) : !isFargate ? (
        <div className="rounded border border-border px-3 py-2 text-[12px] text-fg-muted">
          EC2 launch type — billed per container instance, not per task, so there's no per-service
          Fargate estimate. Requested {reqVcpu.toFixed(reqVcpu < 1 ? 2 : 1)} vCPU /{" "}
          {reqMiB.toLocaleString()} MiB per task.
        </div>
      ) : null}

      {hasUtil ? (
        <>
          <ResourceCard
            title="CPU"
            requested={`${reqVcpu.toFixed(reqVcpu < 1 ? 2 : 1)} vCPU`}
            usedAvg={cpu ? `${cpu.usedAvg.toFixed(2)} vCPU` : "—"}
            utilAvg={cpu?.utilAvg ?? null}
            utilPeak={cpu?.utilPeak ?? null}
          />
          <ResourceCard
            title="memory"
            requested={`${reqMiB.toLocaleString()} MiB`}
            usedAvg={mem ? `${Math.round(mem.usedAvg).toLocaleString()} MiB` : "—"}
            utilAvg={mem?.utilAvg ?? null}
            utilPeak={mem?.utilPeak ?? null}
          />
          <p className="text-[11px] text-fg-muted">
            Utilization over the metrics window ({insights ? "Container Insights" : "AWS/ECS"}).
            Verdict uses peak utilization; over-provisioned ≈ headroom to downsize.
          </p>
        </>
      ) : isLoading && !metrics ? (
        <LoadingState label="loading utilization…" />
      ) : (
        <div className="rounded border border-border px-3 py-2 text-[12px] text-fg-muted">
          No utilization data in the window yet
          {insights
            ? "."
            : " — enable Container Insights on the cluster for per-task CPU/memory."}
        </div>
      )}
    </div>
  );
}

function ResourceCard({
  title,
  requested,
  usedAvg,
  utilAvg,
  utilPeak,
}: {
  title: string;
  requested: string;
  usedAvg: string;
  utilAvg: number | null;
  utilPeak: number | null;
}) {
  const v = verdict(utilPeak);
  return (
    <div className="rounded border border-border p-3">
      <div className="flex items-center gap-3">
        <span className="w-20 text-fg">{title}</span>
        <span className={`text-[12px] ${v.cls}`}>{v.label}</span>
        {utilAvg != null && (
          <span className="ml-auto text-[12px] tabular-nums text-fg-muted">
            avg {utilAvg.toFixed(0)}% · peak {utilPeak?.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-8 text-[13px]">
        <span>
          <span className="text-fg-muted">requested </span>
          <span className="tabular-nums text-fg-dim">{requested}</span>
        </span>
        <span>
          <span className="text-fg-muted">avg used </span>
          <span className="tabular-nums text-fg">{usedAvg}</span>
        </span>
      </div>
    </div>
  );
}
