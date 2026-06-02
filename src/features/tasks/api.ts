import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import type { Scope } from "@/types";

// Lazy EC2 ENI lookup to enrich task networking with SG names / VPC / public IP.
export function useEni(scope: Scope, eniId: string | undefined | null, enabled = true) {
  return useQuery({
    queryKey: qk.eni(scope, eniId ?? ""),
    queryFn: () => invoke("describe_eni", { scope, eniId: eniId! }),
    enabled: enabled && !!eniId,
    staleTime: 5 * 60_000,
  });
}
