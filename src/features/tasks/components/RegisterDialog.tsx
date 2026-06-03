import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useRegisterRevision } from "@/features/tasks/api";
import { Select } from "@/components/ui/Select";
import { DiffView } from "@/components/ui/DiffView";
import { appErrorMessage } from "@/lib/errors";
import { arnName } from "@/lib/arn";
import type { AppError, Scope, TaskDefinition } from "@/types";

interface KV {
  key: string;
  value: string;
}

export function RegisterDialog({
  scope,
  taskDef,
  onClose,
}: {
  scope: Scope;
  taskDef: TaskDefinition;
  onClose: () => void;
}) {
  const containers = taskDef.containerDefs;
  const [containerName, setContainerName] = useState(containers[0]?.name ?? "");
  const cd = containers.find((c) => c.name === containerName) ?? containers[0];

  const [view, setView] = useState<"edit" | "diff">("edit");
  const [image, setImage] = useState(cd?.image ?? "");
  const [cpu, setCpu] = useState(taskDef.cpu ?? "");
  const [memory, setMemory] = useState(taskDef.memory ?? "");
  const [env, setEnv] = useState<KV[]>(cd?.env.map((e) => ({ key: e.key, value: e.value })) ?? []);
  const [secrets, setSecrets] = useState<KV[]>(
    cd?.secrets.map((s) => ({ key: s.key, value: s.sourceArn })) ?? [],
  );
  const register = useRegisterRevision(scope);

  const prev = useRef(containerName);
  useEffect(() => {
    if (prev.current === containerName) return;
    prev.current = containerName;
    setImage(cd?.image ?? "");
    setEnv(cd?.env.map((e) => ({ key: e.key, value: e.value })) ?? []);
    setSecrets(cd?.secrets.map((s) => ({ key: s.key, value: s.sourceArn })) ?? []);
  }, [containerName, cd]);

  const envOut = env.filter((e) => e.key.trim());
  const secretsOut = secrets.filter((s) => s.key.trim() && s.value.trim());

  const before = {
    image: cd?.image,
    cpu: taskDef.cpu,
    memory: taskDef.memory,
    environment: cd?.env ?? [],
    secrets: (cd?.secrets ?? []).map((s) => ({ key: s.key, sourceArn: s.sourceArn })),
  };
  const after = {
    image,
    cpu: cpu || null,
    memory: memory || null,
    environment: envOut,
    secrets: secretsOut.map((s) => ({ key: s.key, sourceArn: s.value })),
  };

  const submit = () => {
    register.mutate(
      {
        baseArn: taskDef.arn,
        containerName,
        image: image || undefined,
        env: envOut.map((e) => ({ key: e.key, value: e.value })),
        secrets: secretsOut.map((s) => ({ key: s.key, sourceArn: s.value })),
        cpu: cpu || undefined,
        memory: memory || undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative flex max-h-[84vh] w-[620px] max-w-[94vw] flex-col rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <span className="text-fg">
            register revision from <span className="text-accent">{arnName(taskDef.arn)}</span>
          </span>
          <div className="ml-auto flex gap-1 text-[12px]">
            {(["edit", "diff"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 ${
                  view === v ? "bg-bg-elev-2 text-fg" : "text-fg-muted hover:text-fg-dim"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {view === "diff" ? (
            <DiffView before={before} after={after} />
          ) : (
            <div className="flex flex-col gap-4">
              <Field label="container">
                {containers.length > 1 ? (
                  <Select
                    value={containerName}
                    onChange={setContainerName}
                    options={containers.map((c) => ({ value: c.name, label: c.name }))}
                  />
                ) : (
                  <span className="text-fg">{containerName}</span>
                )}
              </Field>
              <Field label="image">
                <input
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                />
              </Field>
              <div className="flex gap-6">
                <Field label="task cpu" width="w-24">
                  <input
                    value={cpu}
                    onChange={(e) => setCpu(e.target.value)}
                    className="w-24 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                  />
                </Field>
                <Field label="task memory" width="w-24">
                  <input
                    value={memory}
                    onChange={(e) => setMemory(e.target.value)}
                    className="w-24 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                  />
                </Field>
              </div>

              <RowEditor
                title="environment"
                rows={env}
                onChange={setEnv}
                keyPh="KEY"
                valPh="value"
              />
              <RowEditor
                title="secrets"
                rows={secrets}
                onChange={setSecrets}
                keyPh="KEY"
                valPh="ssm/secretsmanager arn"
              />
            </div>
          )}

          {register.isError && (
            <div className="mt-3 text-[12px] text-err">
              {appErrorMessage(register.error as unknown as AppError)}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-2.5">
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
            disabled={register.isPending || !image.trim()}
            className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {register.isPending ? "registering…" : "register revision"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  width = "w-28",
  children,
}: {
  label: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`${width} shrink-0 text-fg-dim`}>{label}</span>
      {children}
    </div>
  );
}

function RowEditor({
  title,
  rows,
  onChange,
  keyPh,
  valPh,
}: {
  title: string;
  rows: KV[];
  onChange: (rows: KV[]) => void;
  keyPh: string;
  valPh: string;
}) {
  const set = (i: number, patch: Partial<KV>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] uppercase tracking-wide text-fg-muted">{title}</h3>
        <button
          type="button"
          onClick={() => onChange([...rows, { key: "", value: "" }])}
          className="text-fg-muted hover:text-accent"
        >
          + add
        </button>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={r.key}
            placeholder={keyPh}
            onChange={(e) => set(i, { key: e.target.value })}
            className="w-44 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
          />
          <input
            value={r.value}
            placeholder={valPh}
            onChange={(e) => set(i, { value: e.target.value })}
            className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
          />
          <IconButton
            size="sm"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="hover:!text-err"
            aria-label="remove"
          >
            <Trash2 />
          </IconButton>
        </div>
      ))}
    </section>
  );
}
