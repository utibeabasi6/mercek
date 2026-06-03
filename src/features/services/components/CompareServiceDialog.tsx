import { useEffect, useState } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { useClusterResources, useGraphs, useTaskDefinition } from "@/features/discovery/api";
import { Select } from "@/components/ui/Select";
import { LoadingState } from "@/components/ui/StateView";
import { taskDefShort } from "@/lib/arn";
import type { ContainerDef, EnvVar, Scope, Service, TaskDefinition } from "@/types";

const skey = (s: Scope) => `${s.profile}|${s.region}`;

// "Why is prod's service different from staging's" — diff a service against the
// same (or any) service in another scope/region: task-def, image, cpu/mem, env,
// desired, deployment config.
export function CompareServiceDialog({
  scope,
  service,
  onClose,
}: {
  scope: Scope;
  service: Service;
  onClose: () => void;
}) {
  const { graphs } = useGraphs();
  const scopes = graphs.map((g) => g.scope);

  const [targetKey, setTargetKey] = useState(
    () => skey(scopes.find((s) => skey(s) !== skey(scope)) ?? scope),
  );
  const targetScope = scopes.find((s) => skey(s) === targetKey) ?? scope;
  const targetGraph = graphs.find((g) => skey(g.scope) === targetKey) ?? null;

  const [targetCluster, setTargetCluster] = useState("");
  useEffect(() => {
    const clusters = targetGraph?.clusters ?? [];
    if (clusters.length && !clusters.some((c) => c.name === targetCluster)) {
      setTargetCluster((clusters.find((c) => c.name === service.cluster) ?? clusters[0]).name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, targetGraph?.clusters.length]);

  const targetRes = useClusterResources(targetScope, targetCluster, !!targetCluster);
  const [targetSvcName, setTargetSvcName] = useState("");
  useEffect(() => {
    const svcs = targetRes.data?.services ?? [];
    if (svcs.length && !svcs.some((s) => s.name === targetSvcName)) {
      setTargetSvcName((svcs.find((s) => s.name === service.name) ?? svcs[0]).name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRes.data, targetCluster]);
  const targetSvc = targetRes.data?.services.find((s) => s.name === targetSvcName) ?? null;

  const curTd = useTaskDefinition(scope, service.taskDefArn);
  const tgtTd = useTaskDefinition(targetScope, targetSvc?.taskDefArn, !!targetSvc);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative flex max-h-[80vh] w-[680px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="text-fg">
            compare <span className="text-accent">{service.name}</span>
          </span>
          <IconButton onClick={onClose} aria-label="close" className="ml-auto">
            ✕
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-[12px]">
          <span className="text-fg-muted">vs</span>
          <div className="w-40">
            <Select
              value={targetKey}
              onChange={setTargetKey}
              options={scopes.map((s) => ({ value: skey(s), label: `${s.profile} · ${s.region}` }))}
            />
          </div>
          <div className="w-36">
            <Select
              value={targetCluster}
              onChange={setTargetCluster}
              placeholder="cluster"
              options={(targetGraph?.clusters ?? []).map((c) => ({ value: c.name, label: c.name }))}
            />
          </div>
          <div className="w-36">
            <Select
              value={targetSvcName}
              onChange={setTargetSvcName}
              placeholder="service"
              loading={targetRes.isFetching}
              options={(targetRes.data?.services ?? []).map((s) => ({
                value: s.name,
                label: s.name,
              }))}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4 text-[13px]">
          {!targetSvc ? (
            <LoadingState label={targetCluster ? "pick a service to compare" : "pick a cluster"} />
          ) : (
            <Diff
              a={{ label: `${scope.profile}·${scope.region}`, service, td: curTd.data ?? null }}
              b={{
                label: `${targetScope.profile}·${targetScope.region}`,
                service: targetSvc,
                td: tgtTd.data ?? null,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface Side {
  label: string;
  service: Service;
  td: TaskDefinition | null;
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  const diff = a !== b;
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-3 border-t border-border py-1">
      <span className="min-w-0 break-all text-fg-muted">{label}</span>
      <span className={`min-w-0 break-all ${diff ? "text-fg-dim" : "text-fg-muted"}`}>
        {a || "—"}
      </span>
      <span className={`min-w-0 break-all ${diff ? "text-accent" : "text-fg-muted"}`}>
        {b || "—"}
      </span>
    </div>
  );
}

function Diff({ a, b }: { a: Side; b: Side }) {
  const cb = (s: Service) => {
    const c = s.deploymentConfiguration?.deploymentCircuitBreaker;
    return c?.enable ? `on${c.rollback ? "+rollback" : ""}` : "off";
  };
  const containerNames = [
    ...new Set([
      ...(a.td?.containerDefs ?? []).map((c) => c.name),
      ...(b.td?.containerDefs ?? []).map((c) => c.name),
    ]),
  ];
  const find = (td: TaskDefinition | null, name: string): ContainerDef | undefined =>
    td?.containerDefs.find((c) => c.name === name);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,1fr)] gap-3 pb-1 text-[11px] uppercase text-fg-muted">
          <span></span>
          <span className="truncate">{a.label}</span>
          <span className="truncate text-accent">{b.label}</span>
        </div>
        <Row label="task def" a={taskDefShort(a.service.taskDefArn)} b={taskDefShort(b.service.taskDefArn)} />
        <Row label="desired" a={String(a.service.desired)} b={String(b.service.desired)} />
        <Row label="launch type" a={a.service.launchType ?? ""} b={b.service.launchType ?? ""} />
        <Row label="platform" a={a.service.platformVersion ?? ""} b={b.service.platformVersion ?? ""} />
        <Row label="cpu / mem" a={`${a.td?.cpu ?? "—"} / ${a.td?.memory ?? "—"}`} b={`${b.td?.cpu ?? "—"} / ${b.td?.memory ?? "—"}`} />
        <Row
          label="min/max %"
          a={`${a.service.deploymentConfiguration?.minimumHealthyPercent ?? "—"} / ${a.service.deploymentConfiguration?.maximumPercent ?? "—"}`}
          b={`${b.service.deploymentConfiguration?.minimumHealthyPercent ?? "—"} / ${b.service.deploymentConfiguration?.maximumPercent ?? "—"}`}
        />
        <Row label="circuit breaker" a={cb(a.service)} b={cb(b.service)} />
      </div>

      {containerNames.map((name) => {
        const ca = find(a.td, name);
        const cb2 = find(b.td, name);
        const env = envDiff(ca?.env ?? [], cb2?.env ?? []);
        return (
          <div key={name}>
            <div className="text-[11px] uppercase tracking-wide text-fg-muted">
              container · {name}
            </div>
            <Row label="image" a={ca?.image ?? "(absent)"} b={cb2?.image ?? "(absent)"} />
            {env.length === 0 ? (
              <div className="border-t border-border py-1 text-fg-muted">env identical</div>
            ) : (
              env.map((e) => (
                <Row key={e.key} label={e.key} a={e.a ?? "(unset)"} b={e.b ?? "(unset)"} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function envDiff(a: EnvVar[], b: EnvVar[]) {
  const am = new Map(a.map((e) => [e.key, e.value]));
  const bm = new Map(b.map((e) => [e.key, e.value]));
  const keys = [...new Set([...am.keys(), ...bm.keys()])].sort();
  return keys
    .map((key) => ({ key, a: am.get(key), b: bm.get(key) }))
    .filter((d) => d.a !== d.b);
}
