import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// Write path: scale a service's desired count, then reconcile the cluster's resources.
export function useScaleService(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { service: string; desiredCount: number }) =>
      invoke("scale_service", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

export function useForceDeploy(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (service: string) => invoke("force_deploy", { scope, cluster, service }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

// Enable ECS Exec on a service and restart its tasks (so the exec agent runs in them).
export function useEnableExec(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (service: string) => invoke("enable_exec", { scope, cluster, service }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

export function useUpdateService(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      service: string;
      taskDefinition?: string;
      minimumHealthyPercent?: number;
      maximumPercent?: number;
    }) => invoke("update_service", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

// Deploy a new image: register a fresh revision (image swapped, env/secrets kept) and
// point the service at it.
export function useDeployImage(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      service: string;
      baseArn: string;
      containerName: string;
      image: string;
    }) => invoke("deploy_image", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}

// Delete a service (force = stop running tasks too), then reconcile the cluster + tree.
export function useDeleteService(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { service: string; force: boolean }) =>
      invoke("delete_service", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
      void qc.invalidateQueries({ queryKey: qk.discovery.all() });
    },
  });
}

// Create a new service in the cluster, then reconcile the cluster's resources.
export function useCreateService(scope: Scope, cluster: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      name: string;
      taskDefinition: string;
      desiredCount: number;
      launchType: string;
      subnets: string[];
      securityGroups: string[];
      assignPublicIp: boolean;
      targetGroupArn?: string;
      containerName?: string;
      containerPort?: number;
    }) => invoke("create_service", { scope, cluster, ...vars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.clusterResources(scope, cluster) });
    },
  });
}
