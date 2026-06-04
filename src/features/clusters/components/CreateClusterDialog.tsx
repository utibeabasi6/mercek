import { useState } from "react";
import { useCreateCluster } from "@/features/clusters/api";
import { appErrorMessage } from "@/lib/errors";
import type { AppError, Scope } from "@/types";

export function CreateClusterDialog({
  scope,
  onClose,
}: {
  scope: Scope;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [insights, setInsights] = useState(true);
  const create = useCreateCluster(scope);
  const canCreate = !!name.trim() && !create.isPending;

  const submit = () => {
    if (!canCreate) return;
    create.mutate({ name: name.trim(), containerInsights: insights }, { onSuccess: onClose });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[480px] max-w-[92vw] rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          create cluster in{" "}
          <span className="text-accent">
            {scope.profile} · {scope.region}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-fg-dim">name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="cluster name"
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
            />
          </div>
          <label className="flex items-center gap-2 pl-[76px] text-fg-dim">
            <input
              type="checkbox"
              checked={insights}
              onChange={(e) => setInsights(e.target.checked)}
            />
            enable Container Insights
          </label>

          {create.isError && (
            <div className="text-[12px] text-err">
              {appErrorMessage(create.error as unknown as AppError)}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
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
              disabled={!canCreate}
              className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {create.isPending ? "creating…" : "create cluster"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
