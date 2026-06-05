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

// VPCs / subnets / security groups in the scope's region — the awsvpc network choices
// for the run-task and create-service forms.
export function useNetworkOptions(scope: Scope, enabled = true) {
  return useQuery({
    queryKey: qk.networkOptions(scope),
    queryFn: () => invoke("network_options", { scope }),
    enabled,
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
  containerName?: string;
  command: string[];
  env: EnvVar[];
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

export interface NewContainerVars {
  name: string;
  image: string;
  cpu?: number;
  memory?: number;
  port?: number;
  command: string[];
  essential: boolean;
  env: EnvVar[];
}

export interface RegisterTaskDefVars {
  family: string;
  networkMode: string;
  requiresCompatibilities: string[];
  cpu?: string;
  memory?: string;
  executionRoleArn?: string;
  taskRoleArn?: string;
  containers: NewContainerVars[];
}

// Write path: register a brand-new task definition (new family); refresh the pickers.
export function useRegisterTaskDef(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: RegisterTaskDefVars) => invoke("register_task_def", { scope, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["taskDefinitions"] });
      void qc.invalidateQueries({ queryKey: ["taskDefFamilies"] });
    },
  });
}

// Write path: deregister a task-def revision (marks it INACTIVE); refresh the pickers.
export function useDeregisterTaskDef(scope: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arn: string) => invoke("deregister_task_def", { scope, arn }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["taskDefinitions"] });
      void qc.invalidateQueries({ queryKey: ["taskDefFamilies"] });
    },
  });
}
