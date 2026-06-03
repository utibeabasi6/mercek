import { useQuery } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import type { Scope } from "@/types";

// One image's latest ECR scan summary. Scans are immutable per push, so cache long;
// don't retry (a repo without scanning enabled simply errors).
export function useImageScan(scope: Scope, repository: string, reference: string, enabled = true) {
  return useQuery({
    queryKey: ["imageScan", scope.profile, scope.region, repository, reference],
    queryFn: () => invoke("image_scan", { scope, repository, reference }),
    enabled: enabled && !!repository,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
