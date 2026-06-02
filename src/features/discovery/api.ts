import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { REFETCH_MS } from "@/lib/query-client";
import type { AppError, ResourceGraph, Scope } from "@/types";

export function useDiscovery(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: qk.discovery.scope(scope),
    queryFn: () => invoke("discover", { scope }),
    refetchInterval: REFETCH_MS.discovery,
    enabled,
  });
}

export function useActivatedDiscovery(enabled = true) {
  return useQuery({
    queryKey: qk.discovery.activated(),
    queryFn: () => invoke("discover_activated"),
    refetchInterval: REFETCH_MS.discovery,
    enabled,
  });
}

// Persisted snapshots (redb) — resolve fast for instant cold-start before live discovery returns.
export function useSnapshots() {
  return useQuery({
    queryKey: qk.snapshots(),
    queryFn: () => invoke("snapshot_activated"),
    staleTime: Infinity,
  });
}

export interface ScopeError {
  scope: Scope;
  error: AppError;
}

export interface Graphs {
  graphs: ResourceGraph[];
  errors: ScopeError[];
  fromCache: boolean;
  stale: boolean;
  isLoading: boolean;
  isFetching: boolean;
}

// Prefer live discovery (per-scope results carry errors); fall back to the persisted
// snapshot so the UI paints immediately on cold start.
export function useGraphs(): Graphs {
  const discovery = useActivatedDiscovery();
  const snapshots = useSnapshots();
  const results = discovery.data;

  if (!results) {
    return {
      graphs: snapshots.data ?? [],
      errors: [],
      fromCache: !!snapshots.data,
      stale: !!snapshots.data,
      isLoading: discovery.isLoading && !snapshots.data,
      isFetching: discovery.isFetching,
    };
  }

  const graphs = results
    .map((r) => r.graph)
    .filter((g): g is ResourceGraph => g != null);
  const errors = results
    .filter((r) => r.error != null)
    .map((r) => ({ scope: r.scope, error: r.error as AppError }));

  return {
    graphs,
    errors,
    fromCache: false,
    stale: results.some((r) => r.stale),
    isLoading: false,
    isFetching: discovery.isFetching,
  };
}

export function useScopeGraph(scope: Scope) {
  const { graphs } = useGraphs();
  return (
    graphs.find(
      (g) => g.scope.profile === scope.profile && g.scope.region === scope.region,
    ) ?? null
  );
}

// Lazy per-cluster resources — fetched only when `enabled` (cluster expanded / opened).
export function useClusterResources(scope: Scope, cluster: string, enabled = true) {
  return useQuery({
    queryKey: qk.clusterResources(scope, cluster),
    queryFn: () => invoke("cluster_resources", { scope, cluster }),
    refetchInterval: REFETCH_MS.tasks,
    enabled,
  });
}

// Task definitions are immutable per revision — fetch once, cache forever.
export function useTaskDefinition(scope: Scope, arn: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.taskDefinition(scope, arn ?? ""),
    queryFn: () => invoke("task_definition", { scope, arn: arn! }),
    enabled: enabled && !!arn,
    staleTime: Infinity,
  });
}
