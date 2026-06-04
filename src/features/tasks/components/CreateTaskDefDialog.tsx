import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useRegisterTaskDef } from "@/features/tasks/api";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import type { AppError, Scope } from "@/types";

interface EnvRow {
  key: string;
  value: string;
}
interface ContainerForm {
  name: string;
  image: string;
  cpu: string;
  memory: string;
  port: string;
  command: string;
  essential: boolean;
  env: EnvRow[];
}

const emptyContainer = (): ContainerForm => ({
  name: "",
  image: "",
  cpu: "",
  memory: "",
  port: "",
  command: "",
  essential: true,
  env: [],
});

// Parse a numeric field to a number, or undefined when blank/invalid.
const num = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
};

export function CreateTaskDefDialog({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const [family, setFamily] = useState("");
  const [launchType, setLaunchType] = useState("FARGATE");
  const [networkMode, setNetworkMode] = useState("awsvpc");
  const [cpu, setCpu] = useState("256");
  const [memory, setMemory] = useState("512");
  const [executionRoleArn, setExecutionRoleArn] = useState("");
  const [taskRoleArn, setTaskRoleArn] = useState("");
  const [containers, setContainers] = useState<ContainerForm[]>([emptyContainer()]);
  const reg = useRegisterTaskDef(scope);

  const isFargate = launchType === "FARGATE";
  // Fargate is awsvpc-only; for EC2 the network mode is the user's to pick.
  const effectiveNetworkMode = isFargate ? "awsvpc" : networkMode;

  const setContainer = (idx: number, patch: Partial<ContainerForm>) =>
    setContainers((cs) => cs.map((c, i) => (i === idx ? { ...c, ...patch } : c)));

  const built = containers
    .filter((c) => c.name.trim() && c.image.trim())
    .map((c) => ({
      name: c.name.trim(),
      image: c.image.trim(),
      cpu: num(c.cpu),
      memory: num(c.memory),
      port: num(c.port),
      command: c.command.trim() ? c.command.trim().split(/\s+/) : [],
      essential: c.essential,
      env: c.env.filter((e) => e.key.trim()).map((e) => ({ key: e.key, value: e.value })),
    }));

  const canCreate =
    !!family.trim() &&
    built.length >= 1 &&
    (!isFargate || (!!cpu.trim() && !!memory.trim())) &&
    !reg.isPending;

  const submit = () => {
    if (!canCreate) return;
    reg.mutate(
      {
        family: family.trim(),
        networkMode: effectiveNetworkMode,
        requiresCompatibilities: [launchType],
        cpu: cpu.trim() || undefined,
        memory: memory.trim() || undefined,
        executionRoleArn: executionRoleArn.trim() || undefined,
        taskRoleArn: taskRoleArn.trim() || undefined,
        containers: built,
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
        className="relative max-h-[84vh] w-[620px] max-w-[94vw] overflow-auto rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          new task definition in{" "}
          <span className="text-accent">
            {scope.profile} · {scope.region}
          </span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <Row label="family">
            <input
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              placeholder="task-definition family name"
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
            />
          </Row>

          <div className="flex gap-6">
            <Row label="launch type" width="w-24">
              <Select
                value={launchType}
                onChange={(v) => {
                  setLaunchType(v);
                  setNetworkMode(v === "FARGATE" ? "awsvpc" : "bridge");
                }}
                options={[
                  { value: "FARGATE", label: "FARGATE" },
                  { value: "EC2", label: "EC2" },
                ]}
              />
            </Row>
            <Row label="network mode" width="w-28">
              {isFargate ? (
                <span className="text-fg-muted">awsvpc (required)</span>
              ) : (
                <Select
                  value={networkMode}
                  onChange={setNetworkMode}
                  options={["bridge", "host", "awsvpc", "none"].map((m) => ({
                    value: m,
                    label: m,
                  }))}
                />
              )}
            </Row>
          </div>

          <div className="flex gap-6">
            <Row label="task cpu" width="w-24">
              <input
                value={cpu}
                onChange={(e) => setCpu(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={isFargate ? "256" : "optional"}
                className="w-28 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
              />
            </Row>
            <Row label="task memory" width="w-28">
              <input
                value={memory}
                onChange={(e) => setMemory(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={isFargate ? "512" : "optional"}
                className="w-28 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
              />
            </Row>
          </div>

          <Row label="execution role">
            <input
              value={executionRoleArn}
              onChange={(e) => setExecutionRoleArn(e.target.value)}
              placeholder="arn:aws:iam::…:role/ecsTaskExecutionRole (optional)"
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
            />
          </Row>
          <Row label="task role">
            <input
              value={taskRoleArn}
              onChange={(e) => setTaskRoleArn(e.target.value)}
              placeholder="arn:aws:iam::…:role/… (optional)"
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
            />
          </Row>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] uppercase tracking-wide text-fg-muted">containers</span>
            <button
              type="button"
              onClick={() => setContainers((cs) => [...cs, emptyContainer()])}
              className="text-[12px] text-fg-muted hover:text-accent"
            >
              + add container
            </button>
          </div>

          {containers.map((c, i) => (
            <ContainerCard
              key={i}
              value={c}
              canRemove={containers.length > 1}
              onChange={(patch) => setContainer(i, patch)}
              onRemove={() => setContainers((cs) => cs.filter((_, j) => j !== i))}
            />
          ))}

          {reg.isError && (
            <div className="text-[12px] text-err">
              {appErrorMessage(reg.error as unknown as AppError)}
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
              {reg.isPending ? "registering…" : "register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContainerCard({
  value,
  canRemove,
  onChange,
  onRemove,
}: {
  value: ContainerForm;
  canRemove: boolean;
  onChange: (patch: Partial<ContainerForm>) => void;
  onRemove: () => void;
}) {
  const setEnv = (env: EnvRow[]) => onChange({ env });
  return (
    <div className="flex flex-col gap-2 rounded border border-border p-3">
      <div className="flex items-center gap-3">
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="container name"
          className="w-44 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
        />
        <label className="flex items-center gap-1.5 text-[12px] text-fg-dim">
          <input
            type="checkbox"
            checked={value.essential}
            onChange={(e) => onChange({ essential: e.target.checked })}
          />
          essential
        </label>
        {canRemove && (
          <IconButton
            size="sm"
            onClick={onRemove}
            className="ml-auto hover:!text-err"
            aria-label="remove container"
          >
            <Trash2 />
          </IconButton>
        )}
      </div>
      <input
        value={value.image}
        onChange={(e) => onChange({ image: e.target.value })}
        placeholder="image — repo:tag or registry/repo@sha256:…"
        className="rounded border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <input
          value={value.cpu}
          onChange={(e) => onChange({ cpu: e.target.value.replace(/[^0-9]/g, "") })}
          placeholder="cpu units"
          className="w-24 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
        />
        <input
          value={value.memory}
          onChange={(e) => onChange({ memory: e.target.value.replace(/[^0-9]/g, "") })}
          placeholder="memory MiB"
          className="w-28 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
        />
        <input
          value={value.port}
          onChange={(e) => onChange({ port: e.target.value.replace(/[^0-9]/g, "") })}
          placeholder="port"
          className="w-20 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
        />
      </div>
      <input
        value={value.command}
        onChange={(e) => onChange({ command: e.target.value })}
        placeholder="command (optional) — blank = image default"
        className="rounded border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
      />
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setEnv([...value.env, { key: "", value: "" }])}
          className="self-start text-[12px] text-fg-muted hover:text-accent"
        >
          + env var
        </button>
        {value.env.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.key}
              placeholder="KEY"
              onChange={(e) =>
                setEnv(value.env.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
              }
              className="w-40 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
            />
            <input
              value={r.value}
              placeholder="value"
              onChange={(e) =>
                setEnv(value.env.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
              }
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
            />
            <IconButton
              size="sm"
              onClick={() => setEnv(value.env.filter((_, j) => j !== i))}
              className="hover:!text-err"
              aria-label="remove env var"
            >
              <Trash2 />
            </IconButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({
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
