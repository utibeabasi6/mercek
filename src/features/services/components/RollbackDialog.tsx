import { useUpdateService } from "@/features/services/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { appErrorMessage } from "@/lib/errors";
import { taskDefShort } from "@/lib/arn";
import type { AppError, Scope, Service } from "@/types";

// One-click rollback: point the service at a prior task-def revision, triggering a
// rolling deployment. Reuses the update_service write path + diff+confirm.
export function RollbackDialog({
  scope,
  service,
  targetTaskDef,
  onClose,
}: {
  scope: Scope;
  service: Service;
  targetTaskDef: string;
  onClose: () => void;
}) {
  const update = useUpdateService(scope, service.cluster);
  return (
    <ConfirmDialog
      title={
        <>
          roll back <span className="text-accent">{service.name}</span>
        </>
      }
      confirmLabel="roll back"
      danger
      busy={update.isPending}
      errorMessage={update.isError ? appErrorMessage(update.error as unknown as AppError) : undefined}
      onConfirm={() =>
        update.mutate(
          { service: service.name, taskDefinition: targetTaskDef },
          { onSuccess: onClose },
        )
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <span>
          Rolls the service back to a prior revision — ECS starts a new rolling deployment with it.
        </span>
        <div className="rounded border border-border bg-bg px-3 py-2 text-[13px]">
          <span className="text-fg-muted">taskDefinition </span>
          <span className="tabular-nums text-fg-dim">{taskDefShort(service.taskDefArn)}</span>
          <span className="text-fg-muted"> → </span>
          <span className="tabular-nums text-accent">{taskDefShort(targetTaskDef)}</span>
        </div>
      </div>
    </ConfirmDialog>
  );
}
