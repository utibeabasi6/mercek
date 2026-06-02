import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import type { EnvVar, Scope, SecretRef } from "@/types";

// Lazy EC2 ENI lookup to enrich task networking with SG names / VPC / public IP.
export function useEni(scope: Scope, eniId: string | undefined | null, enabled = true) {
  return useQuery({
    queryKey: qk.eni(scope, eniId ?? ""),
    queryFn: () => invoke("describe_eni", { scope, eniId: eniId! }),
    enabled: enabled && !!eniId,
    staleTime: 5 * 60_000,
  });
}

// Write path: stop a task, then reconcile the cluster's resources.
export function useStopTask(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { task: string; reason?: string }) =>
      invoke("stop_task", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

export interface RunTaskVars {
  taskDefinition: string;
  count: number;
  launchType: string;
  subnets: string[];
  securityGroups: string[];
  assignPublicIp: boolean;
}

export function useRunTask(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: RunTaskVars) => invoke("run_task", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

export interface RegisterVars {
  baseArn: string;
  containerName: string;
  image?: string;
  env: EnvVar[];
  secrets: SecretRef[];
  cpu?: string;
  memory?: string;
}

// Write path: register a new task-def revision; refresh the revision/family pickers.
export function useRegisterRevision(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: RegisterVars) => invoke("register_revision", { scope, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["taskDefinitions"] });
      void qc.invalidateQueries({ queryKey: ["taskDefFamilies"] });
    },
  });
}
