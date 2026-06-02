import { tabId, type Tab } from "@/app/shell";
import { arnName } from "@/lib/arn";
import type { Cluster, Scope, Service, Task } from "@/types";

export function clusterTab(scope: Scope, c: Cluster): Tab {
  return {
    id: tabId("cluster", scope, c.name),
    kind: "cluster",
    scope,
    label: c.name,
    sublabel: scope.profile,
    clusterName: c.name,
  };
}

export function serviceTab(scope: Scope, s: Service): Tab {
  return {
    id: tabId("service", scope, s.name),
    kind: "service",
    scope,
    label: s.name,
    sublabel: s.cluster,
    clusterName: s.cluster,
    serviceName: s.name,
  };
}

export function taskTab(scope: Scope, t: Task): Tab {
  return {
    id: tabId("task", scope, t.arn),
    kind: "task",
    scope,
    label: arnName(t.arn).slice(0, 12),
    sublabel: t.service ?? t.cluster,
    clusterName: t.cluster,
    serviceName: t.service ?? undefined,
    taskArn: t.arn,
  };
}
