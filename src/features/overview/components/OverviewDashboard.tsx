import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { tabId, useShell } from "@/app/shell";
import { CreateClusterDialog } from "@/features/clusters/components/CreateClusterDialog";
import { CreateTaskDefDialog } from "@/features/tasks/components/CreateTaskDefDialog";
import { useGraphs } from "@/features/discovery/api";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { LoadingState } from "@/components/ui/StateView";
import { appErrorMessage } from "@/lib/errors";
import { modLabel } from "@/app/keybindings";
import { Kbd } from "@/components/ui/Badge";
import {
  ATTENTION,
  HEALTH_META,
  serviceHealth,
  type Health,
  type ServiceHealth,
} from "@/features/overview/health";
import type { Scope, Service, Task } from "@/types";

interface ClusterTarget {
  scope: Scope;
  cluster: string;
}

interface Loaded {
  services: Service[];
  tasks: Task[];
  isLoading: boolean;
}

interface Row {
  scope: Scope;
  cluster: string;
  service: Service;
  health: ServiceHealth;
}

const TILES: Health[] = ["failed", "degraded", "deploying", "healthy"];
const clusterKey = (scope: Scope, cluster: string) =>
  `${scope.profile}/${scope.region}/${cluster}`;

// A single health pane across every active scope and cluster. Discovery only paints
// clusters (services/tasks load per-cluster), so the overview fans out the same
// `cluster_resources` query the tree uses — sharing its cache, and running only while
// this view is mounted (i.e. while no resource tab is open).
export function OverviewDashboard() {
  const { openTab } = useShell();
  const { graphs, errors, stale, fromCache, isLoading } = useGraphs();
  const [createIn, setCreateIn] = useState<Scope | null>(null);
  const [createTdIn, setCreateTdIn] = useState<Scope | null>(null);

  const targets = useMemo<ClusterTarget[]>(
    () =>
      graphs.flatMap((g) => g.clusters.map((c) => ({ scope: g.scope, cluster: c.name }))),
    [graphs],
  );

  const results = useQueries({
    queries: targets.map((t) => ({
      queryKey: qk.clusterResources(t.scope, t.cluster),
      queryFn: () => invoke("cluster_resources", { scope: t.scope, cluster: t.cluster }),
      refetchInterval: 60_000,
    })),
  });

  // Per-cluster resources keyed by scope+cluster, parallel to `targets` by index.
  const byCluster = useMemo(() => {
    const m = new Map<string, Loaded>();
    targets.forEach((t, i) => {
      const r = results[i];
      m.set(clusterKey(t.scope, t.cluster), {
        services: r?.data?.services ?? [],
        tasks: r?.data?.tasks ?? [],
        isLoading: r?.isLoading ?? false,
      });
    });
    return m;
    // results is a fresh array each render; recomputing this map is cheap.
  }, [targets, results]);

  const rows = useMemo<Row[]>(
    () =>
      targets.flatMap((t) => {
        const loaded = byCluster.get(clusterKey(t.scope, t.cluster));
        return (loaded?.services ?? []).map((service) => ({
          scope: t.scope,
          cluster: t.cluster,
          service,
          health: serviceHealth(service, loaded?.tasks ?? []),
        }));
      }),
    [targets, byCluster],
  );

  const counts = useMemo(() => {
    const c: Record<Health, number> = {
      failed: 0,
      degraded: 0,
      deploying: 0,
      healthy: 0,
      idle: 0,
    };
    for (const r of rows) c[r.health.status] += 1;
    return c;
  }, [rows]);

  const attention = useMemo(
    () =>
      rows
        .filter((r) => ATTENTION.includes(r.health.status))
        .sort((a, b) => HEALTH_META[a.health.status].rank - HEALTH_META[b.health.status].rank),
    [rows],
  );

  const pending = results.filter((r) => r.isLoading).length;

  const totals = useMemo(() => {
    const clusters = graphs.reduce((a, g) => a + g.clusters.length, 0);
    const running = graphs.reduce(
      (a, g) => a + g.clusters.reduce((b, c) => b + c.runningTasksCount, 0),
      0,
    );
    return { scopes: graphs.length, clusters, services: rows.length, running };
  }, [graphs, rows]);

  const openService = (scope: Scope, cluster: string, name: string) =>
    openTab({
      id: tabId("service", scope, `${cluster}/${name}`),
      kind: "service",
      scope,
      label: name,
      sublabel: cluster,
      clusterName: cluster,
      serviceName: name,
    });

  const openCluster = (scope: Scope, cluster: string) =>
    openTab({
      id: tabId("cluster", scope, cluster),
      kind: "cluster",
      scope,
      label: cluster,
      sublabel: scope.profile,
      clusterName: cluster,
    });

  if (isLoading) return <LoadingState label="discovering your ECS estate…" />;

  if (graphs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-fg-muted">
        <div className="text-fg-dim">Overview</div>
        {errors.length > 0 ? (
          <div className="w-full max-w-md space-y-1.5">
            {errors.map((e) => (
              <div
                key={clusterKey(e.scope, "")}
                className="rounded border border-err/40 px-3 py-1.5 text-[12px] text-err"
              >
                <span className="font-medium">
                  {e.scope.profile} · {e.scope.region}
                </span>{" "}
                {appErrorMessage(e.error)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-[12px]">
            <div>Activate a profile in the left rail to see your clusters and services here.</div>
            <div className="flex items-center gap-2">
              <Kbd>{modLabel} K</Kbd> commands
              <Kbd>{modLabel} P</Kbd> go to resource
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[15px] font-semibold text-fg">Overview</h1>
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            {pending > 0 && <span>loading {pending}…</span>}
            {stale && (
              <span className="rounded bg-bg-elev px-1.5 py-0.5">
                {fromCache ? "cached" : "stale"}
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-[12px] text-fg-muted">
          {totals.scopes} scope{totals.scopes === 1 ? "" : "s"} · {totals.clusters} clusters ·{" "}
          {totals.services} services · {totals.running} running tasks
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TILES.map((h) => (
            <div key={h} className="rounded-lg border border-border bg-bg-elev/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${HEALTH_META[h].dot}`} />
                <span className="text-[12px] text-fg-muted">{HEALTH_META[h].label}</span>
              </div>
              <div className="mt-1 text-[20px] font-semibold tabular-nums text-fg">{counts[h]}</div>
            </div>
          ))}
        </div>

        {errors.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {errors.map((e) => (
              <div
                key={clusterKey(e.scope, "")}
                className="rounded border border-err/40 px-3 py-1.5 text-[12px] text-err"
              >
                <span className="font-medium">
                  {e.scope.profile} · {e.scope.region}
                </span>{" "}
                <span className="text-err/80">{appErrorMessage(e.error)}</span>
              </div>
            ))}
          </div>
        )}

        {attention.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[11px] uppercase tracking-wide text-fg-muted">Needs attention</h2>
            <div className="mt-2 divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
              {attention.map((r) => {
                const meta = HEALTH_META[r.health.status];
                return (
                  <button
                    key={`${clusterKey(r.scope, r.cluster)}/${r.service.name}`}
                    type="button"
                    onClick={() => openService(r.scope, r.cluster, r.service.name)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-elev/50"
                  >
                    <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
                    <span className="shrink-0 truncate font-medium text-fg">{r.service.name}</span>
                    <span className="min-w-0 truncate text-[12px] text-fg-muted">
                      {r.cluster} · {r.scope.profile}/{r.scope.region}
                    </span>
                    <span className={`ml-auto shrink-0 truncate text-[12px] ${meta.text}`}>
                      {r.health.reasons[0] ?? meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-6 space-y-5">
          {graphs.map((g) => (
            <div key={clusterKey(g.scope, "")}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-[13px] font-medium text-fg">{g.scope.profile}</h2>
                <span className="text-[11px] text-fg-muted">
                  {g.scope.region}
                  {g.accountId ? ` · ${g.accountId}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => setCreateTdIn(g.scope)}
                  title="register a new task definition in this scope"
                  className="ml-auto shrink-0 text-[11px] text-fg-muted hover:text-accent"
                >
                  + task def
                </button>
                <button
                  type="button"
                  onClick={() => setCreateIn(g.scope)}
                  title="create a cluster in this scope"
                  className="shrink-0 text-[11px] text-fg-muted hover:text-accent"
                >
                  + cluster
                </button>
              </div>
              <div className="mt-2 space-y-3">
                {g.clusters.length === 0 && (
                  <div className="text-[12px] text-fg-muted">no clusters</div>
                )}
                {g.clusters.map((cl) => {
                  const loaded = byCluster.get(clusterKey(g.scope, cl.name));
                  const svcs = loaded?.services ?? [];
                  return (
                    <div key={cl.name} className="overflow-hidden rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => openCluster(g.scope, cl.name)}
                        className="flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left hover:bg-bg-elev/50"
                      >
                        <span className="font-medium text-fg-dim">{cl.name}</span>
                        <span className="text-[11px] text-fg-muted">
                          {svcs.length} svc · {cl.runningTasksCount} running
                        </span>
                      </button>
                      {loaded?.isLoading && svcs.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-fg-muted">loading…</div>
                      ) : svcs.length === 0 ? (
                        <div className="px-3 py-2 text-[12px] text-fg-muted">no services</div>
                      ) : (
                        <div className="divide-y divide-border/40">
                          {svcs.map((s) => {
                            const h = serviceHealth(s, loaded?.tasks ?? []);
                            const meta = HEALTH_META[h.status];
                            return (
                              <button
                                key={s.name}
                                type="button"
                                onClick={() => openService(g.scope, cl.name, s.name)}
                                className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-bg-elev/50"
                                title={h.reasons.join(" · ") || meta.label}
                              >
                                <span className={`size-2 shrink-0 rounded-full ${meta.dot}`} />
                                <span className="min-w-0 flex-1 truncate text-fg">{s.name}</span>
                                <span className="shrink-0 text-[12px] tabular-nums text-fg-muted">
                                  {s.running}/{s.desired}
                                </span>
                                <span
                                  className={`w-20 shrink-0 text-right text-[12px] ${meta.text}`}
                                >
                                  {meta.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      </div>

      {createIn && (
        <CreateClusterDialog scope={createIn} onClose={() => setCreateIn(null)} />
      )}
      {createTdIn && (
        <CreateTaskDefDialog scope={createTdIn} onClose={() => setCreateTdIn(null)} />
      )}
    </div>
  );
}
