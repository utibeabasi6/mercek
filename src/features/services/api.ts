import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { REFETCH_MS } from "@/lib/query-client";
import type { Scope } from "@/types";

export function useTargetHealth(scope: Scope, targetGroupArn: string | undefined) {
  return useQuery({
    queryKey: qk.targetHealth(scope, targetGroupArn ?? ""),
    queryFn: () => invoke("target_health", { scope, targetGroupArn: targetGroupArn! }),
    enabled: !!targetGroupArn,
    refetchInterval: REFETCH_MS.targetHealth,
  });
}

export function useScaling(scope: Scope, cluster: string, service: string, enabled = true) {
  return useQuery({
    queryKey: qk.scaling(scope, cluster, service),
    queryFn: () => invoke("scaling", { scope, cluster, service }),
    enabled,
    staleTime: 60_000,
  });
}
