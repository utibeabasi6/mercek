import type { Service, Task } from "@/types";

// A service's health rolled up from data discovery already returns — no extra AWS
// calls. We never fetch target-group health here: the overview spans every scope, so
// per-target-group calls would fan out across the whole estate. Task-level health
// (`UNHEALTHY` containers) and the deployment rollout cover most of the same ground.
export type Health = "failed" | "degraded" | "deploying" | "healthy" | "idle";

export interface ServiceHealth {
  status: Health;
  reasons: string[];
}

export function serviceHealth(s: Service, tasks: Task[]): ServiceHealth {
  const primary = s.deployments.find((d) => d.status === "PRIMARY") ?? s.deployments[0];
  const rollout = primary?.rolloutState ?? null;
  const failedTasks = s.deployments.reduce((acc, d) => acc + d.failedTasks, 0);
  const unhealthy = tasks.filter(
    (t) => t.cluster === s.cluster && t.service === s.name && t.health === "UNHEALTHY",
  ).length;

  const reasons: string[] = [];
  if (rollout === "failed") reasons.push(primary?.rolloutStateReason ?? "deployment failed");
  if (failedTasks > 0) reasons.push(`${failedTasks} failed task${failedTasks === 1 ? "" : "s"}`);
  if (s.desired > 0 && s.running < s.desired)
    reasons.push(`${s.running}/${s.desired} tasks running`);
  if (unhealthy > 0) reasons.push(`${unhealthy} unhealthy task${unhealthy === 1 ? "" : "s"}`);

  // A failed rollout outranks a count gap; a count gap during an in-progress deploy is
  // expected, so "deploying" wins over "degraded" unless the rollout itself failed.
  let status: Health;
  if (s.desired === 0) status = "idle";
  else if (rollout === "failed") status = "failed";
  else if (rollout === "in_progress") status = "deploying";
  else if (s.running < s.desired || unhealthy > 0) status = "degraded";
  else status = "healthy";

  return { status, reasons };
}

// Per-status display metadata. `rank` orders the "needs attention" list worst-first.
export const HEALTH_META: Record<
  Health,
  { label: string; dot: string; text: string; rank: number }
> = {
  failed: { label: "Failed", dot: "bg-err", text: "text-err", rank: 0 },
  degraded: { label: "Degraded", dot: "bg-warn", text: "text-warn", rank: 1 },
  deploying: { label: "Deploying", dot: "bg-accent", text: "text-accent", rank: 2 },
  healthy: { label: "Healthy", dot: "bg-ok", text: "text-ok", rank: 3 },
  idle: { label: "Idle", dot: "bg-fg-muted", text: "text-fg-muted", rank: 4 },
};

// Statuses that surface in the "needs attention" section, worst-first.
export const ATTENTION: Health[] = ["failed", "degraded", "deploying"];
