import { useClusterResources } from "@/features/discovery/api";
import { useForceDeploy, useUpdateService } from "@/features/services/api";
import { useStopTask } from "@/features/tasks/api";
import { ScaleDialog } from "@/features/services/components/ScaleDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { appErrorMessage } from "@/lib/errors";
import { taskDefShort } from "@/lib/arn";
import type { AppError, ProposedAction } from "@/types";

// The write handoff (agent-panel spec §5.1): a ProposedAction from the agent opens
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
        <span>
          The agent suggests a rolling restart of {proposal.service}. ECS replaces tasks to
          maintain desired count.
        </span>
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
        <span className="break-all">
          The agent suggests stopping {proposal.taskArn}
          {proposal.reason ? ` — reason: ${proposal.reason}` : ""}.
        </span>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      title={
        <>
          update <span className="text-accent">{proposal.service}</span>
        </>
      }
      confirmLabel="apply update"
      busy={update.isPending}
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
      <div className="flex flex-col gap-1">
        <span>The agent suggests updating {proposal.service}:</span>
        {proposal.taskDefinition && (
          <span className="text-fg-dim">task def → {taskDefShort(proposal.taskDefinition)}</span>
        )}
        {proposal.minimumHealthyPercent != null && (
          <span className="text-fg-dim">min healthy % → {proposal.minimumHealthyPercent}</span>
        )}
        {proposal.maximumPercent != null && (
          <span className="text-fg-dim">max % → {proposal.maximumPercent}</span>
        )}
      </div>
    </ConfirmDialog>
  );
}
