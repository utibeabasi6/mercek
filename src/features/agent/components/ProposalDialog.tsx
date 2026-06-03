import { useState } from "react";
import { useClusterResources } from "@/features/discovery/api";
import { useForceDeploy, useUpdateService } from "@/features/services/api";
import { useStopTask } from "@/features/tasks/api";
import { ScaleDialog } from "@/features/services/components/ScaleDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { appErrorMessage } from "@/lib/errors";
import { taskDefShort } from "@/lib/arn";
import type { AppError, ProposedAction, Service } from "@/types";

// The exact AWS CLI a user could run by hand to perform the proposed change — same
// command the confirm button issues, so they can verify or run it themselves.
function awsCli(p: ProposedAction): string {
  const pr = `--profile ${p.scope.profile} --region ${p.scope.region}`;
  switch (p.kind) {
    case "scale":
      return `aws ecs update-service --cluster ${p.cluster} --service ${p.service} --desired-count ${p.desiredCount} ${pr}`;
    case "forceDeploy":
      return `aws ecs update-service --cluster ${p.cluster} --service ${p.service} --force-new-deployment ${pr}`;
    case "stopTask":
      return `aws ecs stop-task --cluster ${p.cluster} --task ${p.taskArn}${
        p.reason ? ` --reason ${JSON.stringify(p.reason)}` : ""
      } ${pr}`;
    case "updateService": {
      const parts = [`aws ecs update-service --cluster ${p.cluster} --service ${p.service}`];
      if (p.taskDefinition) parts.push(`--task-definition ${p.taskDefinition}`);
      const dc: string[] = [];
      if (p.minimumHealthyPercent != null) dc.push(`minimumHealthyPercent=${p.minimumHealthyPercent}`);
      if (p.maximumPercent != null) dc.push(`maximumPercent=${p.maximumPercent}`);
      if (dc.length) parts.push(`--deployment-configuration ${dc.join(",")}`);
      parts.push(pr);
      return parts.join(" ");
    }
  }
}

interface DiffRow {
  label: string;
  from: string;
  to: string;
}

function updateRows(p: Extract<ProposedAction, { kind: "updateService" }>, svc: Service | null): DiffRow[] {
  const rows: DiffRow[] = [];
  if (p.taskDefinition) {
    rows.push({
      label: "task def",
      from: svc ? taskDefShort(svc.taskDefArn) : "…",
      to: taskDefShort(p.taskDefinition),
    });
  }
  const dep = svc?.deploymentConfiguration;
  if (p.minimumHealthyPercent != null) {
    rows.push({ label: "min healthy %", from: String(dep?.minimumHealthyPercent ?? "—"), to: String(p.minimumHealthyPercent) });
  }
  if (p.maximumPercent != null) {
    rows.push({ label: "max %", from: String(dep?.maximumPercent ?? "—"), to: String(p.maximumPercent) });
  }
  return rows;
}

function DiffRows({ rows }: { rows: DiffRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-[12px]">
          <span className="w-28 shrink-0 text-fg-muted">{r.label}</span>
          <span className="break-all text-fg-dim line-through decoration-fg-muted/50">{r.from}</span>
          <span className="shrink-0 text-fg-muted">→</span>
          <span className="break-all text-fg">{r.to}</span>
        </div>
      ))}
    </div>
  );
}

function CliBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-fg-muted">run it manually</div>
      <div className="flex items-start gap-2 rounded border border-border bg-bg-elev-2 p-2">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[11px] text-fg-dim">
          {command}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted hover:border-border-strong hover:text-fg"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}

// The write handoff: a ProposedAction from the agent opens
// the SAME diff+confirm dialog the UI uses, prefilled but unconfirmed. The mutation
// only fires when the human clicks confirm — the agent never executes it.
export function ProposalDialog({
  proposal,
  onClose,
}: {
  proposal: ProposedAction;
  onClose: () => void;
}) {
  // Every variant carries scope + cluster, so these hooks are unconditional.
  const { data: resources } = useClusterResources(proposal.scope, proposal.cluster, true, false);
  const force = useForceDeploy(proposal.scope, proposal.cluster);
  const stop = useStopTask(proposal.scope, proposal.cluster);
  const update = useUpdateService(proposal.scope, proposal.cluster);
  const err = (e: unknown) => appErrorMessage(e as AppError);

  if (proposal.kind === "scale") {
    const svc = resources?.services.find((s) => s.name === proposal.service) ?? null;
    if (!svc) {
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onMouseDown={onClose}
        >
          <div className="absolute inset-0 bg-[var(--overlay)]" />
          <div className="relative rounded border border-border-strong bg-bg-elev px-4 py-3 text-fg-dim">
            loading {proposal.service}…
          </div>
        </div>
      );
    }
    return (
      <ScaleDialog
        scope={proposal.scope}
        service={svc}
        initialDesired={proposal.desiredCount}
        onClose={onClose}
      />
    );
  }

  if (proposal.kind === "forceDeploy") {
    return (
      <ConfirmDialog
        title={
          <>
            force new deployment of <span className="text-accent">{proposal.service}</span>
          </>
        }
        confirmLabel="force deploy"
        busy={force.isPending}
        errorMessage={force.isError ? err(force.error) : undefined}
        onConfirm={() => force.mutate(proposal.service, { onSuccess: onClose })}
        onClose={onClose}
      >
        <div className="flex flex-col gap-3">
          <span>
            The agent suggests a rolling restart of {proposal.service} on the current task def (
            {taskDefShort(
              resources?.services.find((s) => s.name === proposal.service)?.taskDefArn ?? "",
            )}
            ). ECS replaces tasks to maintain desired count.
          </span>
          <CliBlock command={awsCli(proposal)} />
        </div>
      </ConfirmDialog>
    );
  }

  if (proposal.kind === "stopTask") {
    return (
      <ConfirmDialog
        title="stop task"
        confirmLabel="stop task"
        danger
        busy={stop.isPending}
        errorMessage={stop.isError ? err(stop.error) : undefined}
        onConfirm={() =>
          stop.mutate(
            { task: proposal.taskArn, reason: proposal.reason ?? undefined },
            { onSuccess: onClose },
          )
        }
        onClose={onClose}
      >
        <div className="flex flex-col gap-3">
          <span className="break-all">
            The agent suggests stopping {proposal.taskArn}
            {proposal.reason ? ` — reason: ${proposal.reason}` : ""}.
          </span>
          <CliBlock command={awsCli(proposal)} />
        </div>
      </ConfirmDialog>
    );
  }

  const svc = resources?.services.find((s) => s.name === proposal.service) ?? null;
  const curTd = svc ? taskDefShort(svc.taskDefArn) : "…";
  const rows = updateRows(proposal, svc);
  // A change only counts if it actually differs from the live service.
  const tdChanges = proposal.taskDefinition != null && (!svc || taskDefShort(proposal.taskDefinition) !== curTd);
  const hasChange = tdChanges || proposal.minimumHealthyPercent != null || proposal.maximumPercent != null;

  return (
    <ConfirmDialog
      title={
        <>
          update <span className="text-accent">{proposal.service}</span>
        </>
      }
      confirmLabel="apply update"
      busy={update.isPending}
      confirmDisabled={!hasChange}
      errorMessage={update.isError ? err(update.error) : undefined}
      onConfirm={() =>
        update.mutate(
          {
            service: proposal.service,
            taskDefinition: proposal.taskDefinition ?? undefined,
            minimumHealthyPercent: proposal.minimumHealthyPercent ?? undefined,
            maximumPercent: proposal.maximumPercent ?? undefined,
          },
          { onSuccess: onClose },
        )
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="text-[12px] text-fg-muted">
          current task def <span className="font-mono text-fg-dim">{curTd}</span>
        </div>
        {hasChange ? (
          <>
            <DiffRows rows={rows} />
            <CliBlock command={awsCli(proposal)} />
          </>
        ) : (
          <div className="rounded border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-fg-dim">
            This proposal doesn't specify a concrete change — no new task definition or deployment
            settings. Nothing to apply. (If the agent meant to redeploy the current task def, that's
            a "force deploy".)
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
