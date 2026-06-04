import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useShell } from "@/app/shell";
import { EmptyState } from "@/components/ui/StateView";
import { relativeTime } from "@/lib/format";
import { taskDefShort } from "@/lib/arn";
import type { Deployment, Service } from "@/types";

// A timeline merges two ECS sources: the active deployments (the revision anchors,
// with rollout state + circuit-breaker reason) and the service events feed (the
// granular activity — task launches, rollbacks, health, target changes). ECS only
// retains recent events and *active* deployments, so this is recent history, not an
// unbounded audit log — the header says as much.
type Kind = "deploy" | "steady" | "rollback" | "warn" | "scale" | "target" | "info";

interface Entry {
  id: string;
  ts: string | null;
  kind: Kind;
  label: string; // short label for deployment anchors; "" for raw events
  message: string; // event text, or a deployment's rollout reason
  rev?: string;
  anchor: boolean; // a deployment milestone (rendered bolder, with a revision badge)
}

const DOT: Record<Kind, string> = {
  deploy: "bg-accent",
  steady: "bg-ok",
  rollback: "bg-err",
  warn: "bg-warn",
  scale: "bg-fg-muted",
  target: "bg-info",
  info: "bg-fg-muted",
};

function textClass(kind: Kind): string {
  if (kind === "rollback") return "text-err";
  if (kind === "warn") return "text-warn";
  if (kind === "steady") return "text-ok";
  if (kind === "target") return "text-info";
  return "text-fg-dim";
}

// ECS event messages are English sentences; classify by the phrases ECS uses so the
// notable ones (rollbacks, circuit-breaker trips, health) stand out by colour.
function classifyEvent(msg: string): Kind {
  const m = msg.toLowerCase();
  if (
    m.includes("rolling back") ||
    m.includes("deployment failed") ||
    m.includes("unable to consistently")
  )
    return "rollback";
  if (m.includes("steady state") || m.includes("deployment completed")) return "steady";
  if (m.includes("unhealthy") || m.includes("unable to place") || m.includes("failed"))
    return "warn";
  if (
    (m.includes("has started") && m.includes("task")) ||
    m.includes("has stopped") ||
    m.includes("draining")
  )
    return "scale";
  if (m.includes("registered") || m.includes("deregistered")) return "target";
  return "info";
}

function deployEntry(d: Deployment): Entry {
  const kind: Kind =
    d.rolloutState === "failed" ? "rollback" : d.rolloutState === "in_progress" ? "deploy" : "steady";
  const label =
    d.rolloutState === "failed"
      ? "rollout failed"
      : d.rolloutState === "in_progress"
        ? "deploying"
        : "deployment completed";
  const message = d.rolloutStateReason ?? (d.failedTasks > 0 ? `${d.failedTasks} task(s) failed` : "");
  return {
    id: `dep-${d.id}`,
    ts: d.createdAt,
    kind,
    label,
    message,
    rev: taskDefShort(d.taskDef),
    anchor: true,
  };
}

export function DeploymentTimeline({ service }: { service: Service }) {
  const { askAgent } = useShell();

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = service.deployments.map(deployEntry);
    for (const e of service.events) {
      out.push({
        id: `ev-${e.id}`,
        ts: e.createdAt,
        kind: classifyEvent(e.message),
        label: "",
        message: e.message,
        anchor: false,
      });
    }
    out.sort((a, b) => (Date.parse(b.ts ?? "") || 0) - (Date.parse(a.ts ?? "") || 0));
    return out;
  }, [service]);

  if (entries.length === 0) {
    return <EmptyState label="no deployment history in the retained window" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="text-[12px] text-fg-muted">
          Deployments and service events over ECS's retained window — recent activity, not full
          history.
        </p>
        <button
          type="button"
          onClick={() =>
            askAgent(
              `Review the recent deployment history for service ${service.name} in cluster ${service.cluster}: revision changes, any rollbacks or circuit-breaker trips, failing tasks, and whether it's currently stable. Use the deployments list, the service events feed, and failing tasks' stop reasons. Summarize what happened and flag anything risky.`,
            )
          }
          title="ask the agent to review the deployment history"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded border border-border px-2 py-1 text-[12px] text-fg-dim hover:border-accent hover:text-accent"
        >
          <Sparkles size={13} /> investigate
        </button>
      </div>

      <div className="flex flex-col">
        {entries.map((e, i) => {
          const last = i === entries.length - 1;
          return (
            <div key={e.id} className="flex gap-3">
              <div className="flex w-2.5 flex-col items-center">
                <span
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[e.kind]}`}
                  aria-hidden
                />
                {!last && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <div className="flex items-baseline gap-2">
                  {e.anchor ? (
                    <span className="font-medium text-fg">{e.label}</span>
                  ) : (
                    <span className={`min-w-0 flex-1 break-words ${textClass(e.kind)}`}>
                      {e.message}
                    </span>
                  )}
                  {e.rev && (
                    <span className="shrink-0 rounded bg-bg-elev px-1.5 py-0.5 text-[11px] tabular-nums text-accent">
                      {e.rev}
                    </span>
                  )}
                  <span
                    className="ml-auto shrink-0 text-[11px] text-fg-muted"
                    title={e.ts ? new Date(e.ts).toLocaleString() : undefined}
                  >
                    {relativeTime(e.ts)}
                  </span>
                </div>
                {e.anchor && e.message && (
                  <div
                    className={`mt-0.5 break-words text-[12px] ${
                      e.kind === "rollback" ? "text-err" : "text-fg-muted"
                    }`}
                  >
                    {e.message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
