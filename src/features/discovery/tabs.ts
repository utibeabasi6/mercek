import { tabId, type Tab } from "@/app/shell";
import { arnName } from "@/lib/arn";
import type { Cluster, Scope, Service, Task } from "@/types";

// Optional deep-link target (agent-panel spec §6): land on a sub-tab and/or
// scroll to a specific element (e.g. a deployment id).
export interface TabLink {
  section?: string;
  focusId?: string;
}

export function clusterTab(scope: Scope, c: Cluster, link?: TabLink): Tab {
  return {
    id: tabId("cluster", scope, c.name),
    kind: "cluster",
    scope,
    label: c.name,
    sublabel: scope.profile,
    clusterName: c.name,
    ...link,
  };
}

// Service key includes the cluster — two clusters can hold same-named services.
export function serviceTab(scope: Scope, s: Service, link?: TabLink): Tab {
  return {
    id: tabId("service", scope, `${s.cluster}/${s.name}`),
    kind: "service",
    scope,
    label: s.name,
    sublabel: s.cluster,
    clusterName: s.cluster,
    serviceName: s.name,
    ...link,
  };
}

export function taskTab(scope: Scope, t: Task, link?: TabLink): Tab {
  return {
    id: tabId("task", scope, t.arn),
    kind: "task",
    scope,
    label: arnName(t.arn).slice(0, 12),
    sublabel: t.service ?? t.cluster,
    clusterName: t.cluster,
    serviceName: t.service ?? undefined,
    taskArn: t.arn,
    ...link,
  };
}
