import { Sparkles, X } from "lucide-react";
import { useShell, tabId, type Tab } from "@/app/shell";
import { dismissObservation, type Observation } from "@/features/sentinel/store";

// Send a finding to the screen most useful for it.
function tabFor(o: Observation): Tab {
  const section =
    o.kind === "stalled_deploy" ? "deployments" : o.kind === "oom" || o.kind === "flapping" ? "tasks" : "overview";
  if (o.service) {
    return {
      id: tabId("service", o.scope, `${o.cluster}/${o.service}`),
      kind: "service",
      scope: o.scope,
      label: o.service,
      sublabel: o.cluster,
      clusterName: o.cluster,
      serviceName: o.service,
      section,
    };
  }
  return {
    id: tabId("cluster", o.scope, o.cluster),
    kind: "cluster",
    scope: o.scope,
    label: o.cluster,
    sublabel: o.scope.profile,
    clusterName: o.cluster,
  };
}

function investigatePrompt(o: Observation): string {
  const where = o.service
    ? `service \`${o.service}\` in cluster \`${o.cluster}\``
    : `cluster \`${o.cluster}\``;
  return `Investigate this issue in ${where} (profile=${o.scope.profile} region=${o.scope.region}): ${o.title}. ${o.detail} Correlate the deployment/rollout state, failing tasks (stop reasons + exit codes), and recent logs, then give me the root cause and a fix.`;
}

function ageLabel(firstSeen: number): string {
  const mins = Math.max(0, Math.round((Date.now() - firstSeen) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h`;
}

export function ObservationList({
  items,
  onNavigate,
}: {
  items: Observation[];
  onNavigate?: () => void;
}) {
  const { openTab, askAgent } = useShell();

  if (items.length === 0) {
    return <div className="px-3 py-3 text-[12px] text-fg-muted">No open observations.</div>;
  }

  return (
    <div className="flex flex-col">
      {items.map((o) => (
        <div
          key={o.id}
          className="group flex items-start gap-2 border-t border-border px-2.5 py-2 text-[12px] first:border-t-0"
        >
          <span
            className={`mt-1 size-2 shrink-0 rounded-full ${
              o.severity === "critical" ? "bg-err" : "bg-warn"
            }`}
            aria-label={o.severity}
          />
          <button
            type="button"
            onClick={() => {
              openTab(tabFor(o));
              onNavigate?.();
            }}
            className="min-w-0 flex-1 text-left"
            title="open the affected resource"
          >
            <div className="truncate font-medium text-fg">{o.title}</div>
            <div className="break-words text-fg-muted">{o.detail}</div>
            <div className="mt-0.5 text-[11px] text-fg-muted">{ageLabel(o.firstSeen)}</div>
          </button>
          <button
            type="button"
            onClick={() => askAgent(investigatePrompt(o))}
            title="ask the agent to investigate"
            aria-label="investigate"
            className="shrink-0 self-start text-accent opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
          >
            <Sparkles size={14} />
          </button>
          <button
            type="button"
            onClick={() => dismissObservation(o.id)}
            title="dismiss"
            aria-label="dismiss"
            className="shrink-0 self-start text-fg-muted opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
