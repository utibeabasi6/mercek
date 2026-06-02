import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import type { Scope } from "@/types";

export function useProfiles() {
  return useQuery({
    queryKey: qk.profiles(),
    queryFn: () => invoke("list_profiles"),
    staleTime: 5 * 60_000,
  });
}

export function useScopes() {
  return useQuery({
    queryKey: qk.scopes(),
    queryFn: () => invoke("get_scopes"),
  });
}

export function useSetScopes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scopes: Scope[]) => invoke("set_scopes", { scopes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.scopes() });
      void qc.invalidateQueries({ queryKey: qk.discovery.all() });
    },
  });
}
