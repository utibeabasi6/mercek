import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { REFETCH_MS } from "@/lib/query-client";
import type { Scope } from "@/types";

export function useServiceMetrics(
  scope: Scope,
  cluster: string,
  service: string,
  containerInsights: boolean,
  rangeSecs: number,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.metrics.service(scope, cluster, service, containerInsights, rangeSecs),
    queryFn: () =>
      invoke("service_metrics", { scope, cluster, service, containerInsights, rangeSecs }),
    refetchInterval: REFETCH_MS.metrics,
    enabled,
  });
}

export function useClusterMetrics(
  scope: Scope,
  cluster: string,
  containerInsights: boolean,
  rangeSecs: number,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.metrics.cluster(scope, cluster, containerInsights, rangeSecs),
    queryFn: () => invoke("cluster_metrics", { scope, cluster, containerInsights, rangeSecs }),
    refetchInterval: REFETCH_MS.metrics,
    enabled,
  });
}

export function useAlbMetrics(
  scope: Scope,
  targetGroupArn: string | undefined,
  rangeSecs: number,
  enabled = true,
) {
  return useQuery({
    queryKey: qk.metrics.alb(scope, targetGroupArn ?? "", rangeSecs),
    queryFn: () => invoke("alb_metrics", { scope, targetGroupArn: targetGroupArn!, rangeSecs }),
    refetchInterval: REFETCH_MS.metrics,
    enabled: enabled && !!targetGroupArn,
  });
}
