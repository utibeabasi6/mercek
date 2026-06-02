import type { Scope } from "@/types";

const scopeKey = (scope: Scope) => [scope.profile, scope.region] as const;

export const qk = {
  profiles: () => ["profiles"] as const,
  scopes: () => ["scopes"] as const,
  agents: () => ["agents"] as const,
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
  taskDefinitions: (scope: Scope, family: string) =>
    ["taskDefinitions", ...scopeKey(scope), family] as const,
  taskDefFamilies: (scope: Scope) => ["taskDefFamilies", ...scopeKey(scope)] as const,
  eni: (scope: Scope, eniId: string) => ["eni", ...scopeKey(scope), eniId] as const,
  targetHealth: (scope: Scope, targetGroupArn: string) =>
    ["targetHealth", ...scopeKey(scope), targetGroupArn] as const,
  scaling: (scope: Scope, cluster: string, service: string) =>
    ["scaling", ...scopeKey(scope), cluster, service] as const,
  metrics: {
    service: (scope: Scope, cluster: string, service: string, insights: boolean) =>
      ["metrics", "service", ...scopeKey(scope), cluster, service, insights] as const,
    cluster: (scope: Scope, cluster: string, insights: boolean) =>
      ["metrics", "cluster", ...scopeKey(scope), cluster, insights] as const,
    alb: (scope: Scope, targetGroupArn: string) =>
      ["metrics", "alb", ...scopeKey(scope), targetGroupArn] as const,
  },
} as const;
