import { useState } from "react";
import { useTaskDefinitionRevisions } from "@/features/discovery/api";
import { useUpdateService } from "@/features/services/api";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import { arnName } from "@/lib/arn";
import type { AppError, Scope, Service } from "@/types";

export function UpdateDialog({
  scope,
  service,
  onClose,
}: {
  scope: Scope;
  service: Service;
  onClose: () => void;
}) {
  const currentArn = service.taskDefArn;
  const family = arnName(currentArn).split(":")[0];
  const currentMin = service.deploymentConfiguration?.minimumHealthyPercent ?? null;
  const currentMax = service.deploymentConfiguration?.maximumPercent ?? null;

  const { data: revisions, refetch, isFetching } = useTaskDefinitionRevisions(scope, family);
  const update = useUpdateService(scope, service.cluster);

  const [taskDef, setTaskDef] = useState(currentArn);
  const [minStr, setMinStr] = useState(currentMin?.toString() ?? "");
  const [maxStr, setMaxStr] = useState(currentMax?.toString() ?? "");

  const options = revisions?.includes(currentArn)
    ? revisions
    : [currentArn, ...(revisions ?? [])];

  const minVal = minStr.trim() === "" ? undefined : Math.max(0, Math.floor(Number(minStr)));
  const maxVal = maxStr.trim() === "" ? undefined : Math.max(0, Math.floor(Number(maxStr)));
  const taskDefChanged = taskDef !== currentArn;
  const minChanged = (minVal ?? null) !== currentMin;
  const maxChanged = (maxVal ?? null) !== currentMax;
  const changed = taskDefChanged || minChanged || maxChanged;

  const submit = () => {
    if (!changed) return;
    update.mutate(
      {
        service: service.name,
        taskDefinition: taskDefChanged ? taskDef : undefined,
        minimumHealthyPercent: minChanged ? minVal : undefined,
        maximumPercent: maxChanged ? maxVal : undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[520px] max-w-[92vw] overflow-hidden rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          update <span className="text-accent">{service.name}</span>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-fg-dim">task definition</span>
            <Select
              value={taskDef}
              onChange={setTaskDef}
              onOpen={() => void refetch()}
              loading={isFetching}
              options={options.map((arn) => ({ value: arn, label: arnName(arn) }))}
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <span className="text-fg-dim">min healthy %</span>
              <input
                value={minStr}
                onChange={(e) => setMinStr(e.target.value)}
                inputMode="numeric"
                className="w-20 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-fg-dim">max %</span>
              <input
                value={maxStr}
                onChange={(e) => setMaxStr(e.target.value)}
                inputMode="numeric"
                className="w-20 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
              />
            </label>
          </div>

          <div className="flex flex-col gap-1 rounded border border-border bg-bg px-3 py-2 text-[13px]">
            <DiffRow
              label="taskDefinition"
              before={arnName(currentArn)}
              after={arnName(taskDef)}
              changed={taskDefChanged}
            />
            <DiffRow
              label="minHealthy"
              before={currentMin?.toString() ?? "default"}
              after={minVal?.toString() ?? "default"}
              changed={minChanged}
            />
            <DiffRow
              label="maxPercent"
              before={currentMax?.toString() ?? "default"}
              after={maxVal?.toString() ?? "default"}
              changed={maxChanged}
            />
          </div>

          {update.isError && (
            <div className="text-[12px] text-err">
              {appErrorMessage(update.error as unknown as AppError)}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1 text-fg-dim hover:text-fg"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!changed || update.isPending}
              className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {update.isPending ? "updating…" : "confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiffRow({
  label,
  before,
  after,
  changed,
}: {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 text-fg-muted">{label}</span>
      <span className="text-fg-dim">{before}</span>
      <span className="text-fg-muted">→</span>
      <span className={changed ? "text-accent" : "text-fg-dim"}>{after}</span>
    </div>
  );
}
