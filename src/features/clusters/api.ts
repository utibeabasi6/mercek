import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import type { Scope } from "@/types";

// Create a new cluster, then refresh discovery so it shows up in the tree and overview.
export function useCreateCluster(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; containerInsights: boolean }) =>
      invoke("create_cluster", { scope, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.discovery.all() });
    },
  });
}

// Delete a cluster (must be empty), then refresh discovery.
export function useDeleteCluster(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => invoke("delete_cluster", { scope, name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.discovery.all() });
    },
  });
}
