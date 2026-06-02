import type { Scope } from "@/types";

const scopeKey = (scope: Scope) => [scope.profile, scope.region] as const;

export const qk = {
  profiles: () => ["profiles"] as const,
  scopes: () => ["scopes"] as const,
  discovery: {
    all: () => ["discovery"] as const,
    activated: () => ["discovery", "activated"] as const,
    scope: (scope: Scope) => ["discovery", ...scopeKey(scope)] as const,
  },
  snapshots: () => ["snapshots"] as const,
  clusterResources: (scope: Scope, cluster: string) =>
    ["clusterResources", ...scopeKey(scope), cluster] as const,
  taskDefinition: (scope: Scope, arn: string) =>
    ["taskDefinition", ...scopeKey(scope), arn] as const,
  eni: (scope: Scope, eniId: string) => ["eni", ...scopeKey(scope), eniId] as const,
  targetHealth: (scope: Scope, targetGroupArn: string) =>
    ["targetHealth", ...scopeKey(scope), targetGroupArn] as const,
  scaling: (scope: Scope, cluster: string, service: string) =>
    ["scaling", ...scopeKey(scope), cluster, service] as const,
  metrics: {
    service: (scope: Scope, cluster: string, service: string) =>
      ["metrics", "service", ...scopeKey(scope), cluster, service] as const,
    cluster: (scope: Scope, cluster: string) =>
      ["metrics", "cluster", ...scopeKey(scope), cluster] as const,
  },
} as const;
