import { useState } from "react";
import { useScaleService } from "@/features/services/api";
import { appErrorMessage } from "@/lib/errors";
import type { AppError, Scope, Service } from "@/types";

export function ScaleDialog({
  scope,
  service,
  onClose,
  initialDesired,
}: {
  scope: Scope;
  service: Service;
  onClose: () => void;
  // Prefill; defaults to current.
  initialDesired?: number;
}) {
  const [desired, setDesired] = useState(initialDesired ?? service.desired);
  const scale = useScaleService(scope, service.cluster);
  const changed = desired !== service.desired;

  const submit = () => {
    if (!changed) return;
    scale.mutate(
      { service: service.name, desiredCount: desired },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[440px] max-w-[90vw] overflow-hidden rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          scale <span className="text-accent">{service.name}</span>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <label className="flex items-center gap-3">
            <span className="w-28 text-fg-dim">desired count</span>
            <input
              type="number"
              min={0}
              value={desired}
              autoFocus
              onChange={(e) => setDesired(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onClose();
              }}
              className="w-24 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
            />
          </label>

          <div className="rounded border border-border bg-bg px-3 py-2 text-[13px]">
            <span className="text-fg-muted">desiredCount </span>
            <span className="tabular-nums text-fg-dim">{service.desired}</span>
            <span className="text-fg-muted"> → </span>
            <span className={`tabular-nums ${changed ? "text-accent" : "text-fg-dim"}`}>
              {desired}
            </span>
            <span className="ml-2 text-fg-muted">
              ({service.running} running now)
            </span>
          </div>

          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-fg-muted">
              run it manually
            </div>
            <code className="block whitespace-pre-wrap break-all rounded border border-border bg-bg-elev-2 p-2 font-mono text-[11px] text-fg-dim">
              {`aws ecs update-service --cluster ${service.cluster} --service ${service.name} --desired-count ${desired} --profile ${scope.profile} --region ${scope.region}`}
            </code>
          </div>

          {scale.isError && (
            <div className="text-[12px] text-err">
              {appErrorMessage(scale.error as unknown as AppError)}
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
              disabled={!changed || scale.isPending}
              className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scale.isPending ? "scaling…" : "confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
