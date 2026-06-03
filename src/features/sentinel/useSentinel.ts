import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useGraphs } from "@/features/discovery/api";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { detect, type ScopeResources } from "@/features/sentinel/detect";
import { useVulnFindings } from "@/features/sentinel/useVulnFindings";
import { reconcile } from "@/features/sentinel/store";

// The sentinel. The global discovery graph is shallow (no services/tasks), so we
// poll each cluster's resources (the same shared query the tree/detail views use)
// and run the detectors over the aggregate. Mount once (in the shell). In-app only —
// out-of-app alerting would move this to a backend daemon.
export function useSentinel() {
  const { graphs } = useGraphs();

  // Every (scope, cluster) pair to watch.
  const pairs = useMemo(
    () =>
      graphs.flatMap((g) => g.clusters.map((c) => ({ scope: g.scope, cluster: c.name }))),
    [graphs],
  );

  const results = useQueries({
    queries: pairs.map((p) => ({
      queryKey: qk.clusterResources(p.scope, p.cluster),
      queryFn: () => invoke("cluster_resources", { scope: p.scope, cluster: p.cluster }),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
  });

  // Aggregate per scope (services/tasks across the scope's clusters).
  const inputs: ScopeResources[] = [];
  const byScope = new Map<string, ScopeResources>();
  pairs.forEach((p, i) => {
    const data = results[i]?.data;
    if (!data) return;
    const key = `${p.scope.profile}:${p.scope.region}`;
    let agg = byScope.get(key);
    if (!agg) {
      agg = { scope: p.scope, services: [], tasks: [] };
      byScope.set(key, agg);
      inputs.push(agg);
    }
    agg.services.push(...data.services);
    agg.tasks.push(...data.tasks);
  });

  const vulns = useVulnFindings(inputs);

  // Re-run only when the detection-relevant data actually changes.
  const sig =
    inputs
      .map(
        (s) =>
          `${s.scope.profile}/${s.scope.region}#` +
          s.services
            .map(
              (v) =>
                `${v.name}:${v.running}/${v.desired}/${v.pending}:${v.deployments
                  .map((d) => `${d.rolloutState}.${d.failedTasks}`)
                  .join(",")}`,
            )
            .join("|") +
          `#oom:${s.tasks.filter((t) => t.containers.some((c) => c.exitCode === 137)).length}`,
      )
      .join("||") + `;;${vulns.map((v) => `${v.id}:${v.severity}`).join("|")}`;

  useEffect(() => {
    reconcile([...detect(inputs, Date.now()), ...vulns], Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
