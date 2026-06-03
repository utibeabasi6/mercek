import type { Scope, Service, Task } from "@/types";
import type { DetectedObservation } from "@/features/sentinel/store";

// Per-scope resources the sentinel detects over. The global discovery graph is
// shallow (no services/tasks), so the sentinel aggregates per-cluster resources.
export interface ScopeResources {
  scope: Scope;
  services: Service[];
  tasks: Task[];
}

// Pure detectors. Each returns stable ids (per scope/cluster/service/kind) so the
// store can track a finding across poll cycles.

const STALL_MS = 10 * 60 * 1000; // a rollout in_progress longer than this looks stuck
const OOM_RE = /out.?of.?memory|oom|memory/i;

export function detect(graphs: ScopeResources[], now: number): DetectedObservation[] {
  const out: DetectedObservation[] = [];

  for (const g of graphs) {
    const key = (cluster: string, who: string, kind: string) =>
      `${g.scope.profile}:${g.scope.region}:${cluster}:${who}:${kind}`;

    for (const s of g.services) {
      const deploying = s.deployments.some((d) => d.rolloutState === "in_progress");

      // Drift: below desired while NOT actively deploying (a deploy legitimately
      // dips running).
      if (s.desired > 0 && s.running < s.desired && !deploying) {
        out.push({
          id: key(s.cluster, s.name, "drift"),
          kind: "drift",
          severity: s.running === 0 ? "critical" : "warn",
          scope: g.scope,
          cluster: s.cluster,
          service: s.name,
          title: `${s.name} — ${s.running}/${s.desired} running`,
          detail: `Running below desired${s.pending > 0 ? ` (${s.pending} pending)` : ""}.`,
        });
      }

      // Stalled / failed rollout.
      const failed = s.deployments.find((d) => d.rolloutState === "failed");
      const stalled = s.deployments.find(
        (d) =>
          d.rolloutState === "in_progress" &&
          d.createdAt != null &&
          now - Date.parse(d.createdAt) > STALL_MS,
      );
      if (failed) {
        out.push({
          id: key(s.cluster, s.name, "stalled_deploy"),
          kind: "stalled_deploy",
          severity: "critical",
          scope: g.scope,
          cluster: s.cluster,
          service: s.name,
          title: `${s.name} — rollout failed`,
          detail: failed.rolloutStateReason ?? "The deployment's rollout failed.",
        });
      } else if (stalled) {
        out.push({
          id: key(s.cluster, s.name, "stalled_deploy"),
          kind: "stalled_deploy",
          severity: "warn",
          scope: g.scope,
          cluster: s.cluster,
          service: s.name,
          title: `${s.name} — deployment stalled`,
          detail: stalled.rolloutStateReason ?? "Rollout has been in progress longer than expected.",
        });
      }

      // Flapping: tasks failing within the active deployments.
      const failing = s.deployments.reduce((n, d) => n + (d.failedTasks ?? 0), 0);
      if (failing > 0) {
        out.push({
          id: key(s.cluster, s.name, "flapping"),
          kind: "flapping",
          severity: failing >= 3 ? "critical" : "warn",
          scope: g.scope,
          cluster: s.cluster,
          service: s.name,
          title: `${s.name} — ${failing} failed task${failing === 1 ? "" : "s"}`,
          detail: "Tasks are failing to start or stay up — possible crash loop.",
        });
      }
    }

    // OOM kills (one per service/task that shows the signal).
    for (const t of g.tasks) {
      const oomReason = OOM_RE.test(t.stoppedReason ?? "");
      const oomContainer = t.containers.some(
        (c) => c.exitCode === 137 || OOM_RE.test(c.reason ?? ""),
      );
      if (oomReason || oomContainer) {
        const who = t.service ?? t.arn;
        out.push({
          id: key(t.cluster, who, "oom"),
          kind: "oom",
          severity: "critical",
          scope: g.scope,
          cluster: t.cluster,
          service: t.service ?? undefined,
          title: `${t.service ?? "task"} — out of memory`,
          detail: oomContainer
            ? "A container exited with code 137 (OOM-killed)."
            : (t.stoppedReason ?? "Task was OOM-killed."),
        });
      }
    }
  }

  return out;
}
