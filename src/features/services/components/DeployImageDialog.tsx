import { useEffect, useState } from "react";
import { useTaskDefinition } from "@/features/discovery/api";
import { useDeployImage } from "@/features/services/api";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import { taskDefShort } from "@/lib/arn";
import type { AppError, Scope, Service } from "@/types";

// Streamlined "change the image tag" flow: registers a new task-def revision with only
// the chosen container's image swapped (env, secrets, everything else preserved) and
// rolls the service onto it.
export function DeployImageDialog({
  scope,
  service,
  onClose,
}: {
  scope: Scope;
  service: Service;
  onClose: () => void;
}) {
  const td = useTaskDefinition(scope, service.taskDefArn);
  const containers = td.data?.containerDefs ?? [];
  const [containerName, setContainerName] = useState("");
  const selected = containerName || containers[0]?.name || "";
  const current = containers.find((c) => c.name === selected)?.image ?? "";
  const [image, setImage] = useState("");
  const deploy = useDeployImage(scope, service.cluster);

  // Prefill with the current image once the task def loads (and when the container
  // selection changes), so the user just edits the tag.
  useEffect(() => {
    setImage(current);
  }, [current]);

  const next = image.trim();
  const changed = next !== "" && next !== current;
  const submit = () => {
    if (!changed || !selected) return;
    deploy.mutate(
      { service: service.name, baseArn: service.taskDefArn, containerName: selected, image: next },
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
        className="relative w-[560px] max-w-[92vw] rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          deploy image to <span className="text-accent">{service.name}</span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          {containers.length > 1 && (
            <Row label="container">
              <Select
                value={selected}
                onChange={setContainerName}
                options={containers.map((c) => ({ value: c.name, label: c.name }))}
              />
            </Row>
          )}
          <Row label="image">
            <input
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="repo:tag or registry/repo@sha256:…"
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
            />
          </Row>

          <p className="text-[12px] text-fg-muted">
            Registers a new revision of{" "}
            <span className="text-fg-dim">{taskDefShort(service.taskDefArn)}</span> with this
            image, then updates the service — a normal rolling deployment. Other fields are copied
            from the current revision.
          </p>

          {deploy.isError && (
            <div className="text-[12px] text-err">
              {appErrorMessage(deploy.error as unknown as AppError)}
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
              disabled={!changed || deploy.isPending}
              className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deploy.isPending ? "deploying…" : "deploy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 text-fg-dim">{label}</span>
      {children}
    </div>
  );
}
