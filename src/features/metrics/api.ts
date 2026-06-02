import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { REFETCH_MS } from "@/lib/query-client";
import type { Scope } from "@/types";

export function useServiceMetrics(scope: Scope, cluster: string, service: string, enabled = true) {
  return useQuery({
    queryKey: qk.metrics.service(scope, cluster, service),
    queryFn: () => invoke("service_metrics", { scope, cluster, service }),
    refetchInterval: REFETCH_MS.metrics,
    enabled,
  });
}

export function useClusterMetrics(scope: Scope, cluster: string, enabled = true) {
  return useQuery({
    queryKey: qk.metrics.cluster(scope, cluster),
    queryFn: () => invoke("cluster_metrics", { scope, cluster }),
    refetchInterval: REFETCH_MS.metrics,
    enabled,
  });
}
