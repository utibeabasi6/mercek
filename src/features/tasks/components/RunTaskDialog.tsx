import { useState } from "react";
import { Trash2 } from "lucide-react";
import {
  useTaskDefFamilies,
  useTaskDefinition,
  useTaskDefinitionRevisions,
} from "@/features/discovery/api";
import { useRunTask } from "@/features/tasks/api";
import {
  NetworkConfigFields,
  type NetworkConfig,
} from "@/features/tasks/components/NetworkConfigFields";
import { IconButton } from "@/components/ui/IconButton";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import { arnName } from "@/lib/arn";
import type { AppError, Scope } from "@/types";

// Command override is argv split on whitespace (no shell quoting).
const parseArgv = (s: string) => s.trim().split(/\s+/).filter(Boolean);

export function RunTaskDialog({
  scope,
  cluster,
  onClose,
}: {
  scope: Scope;
  cluster: string;
  onClose: () => void;
}) {
  const families = useTaskDefFamilies(scope);
  const [family, setFamily] = useState("");
  const revisions = useTaskDefinitionRevisions(scope, family, !!family);
  const [taskDef, setTaskDef] = useState("");
  const [count, setCount] = useState(1);
  const [launchType, setLaunchType] = useState("FARGATE");
  const [net, setNet] = useState<NetworkConfig>({
    subnets: [],
    securityGroups: [],
    assignPublicIp: false,
    ready: false,
  });
  const [containerName, setContainerName] = useState("");
  const [commandStr, setCommandStr] = useState("");
  const [envRows, setEnvRows] = useState<{ key: string; value: string }[]>([]);
  const run = useRunTask(scope, cluster);

  const revList = revisions.data ?? [];
  const selectedRev = taskDef && revList.includes(taskDef) ? taskDef : (revList[0] ?? "");
  const td = useTaskDefinition(scope, selectedRev || undefined, !!selectedRev);
  const containers = td.data?.containerDefs ?? [];
  const overrideContainer = containerName || containers[0]?.name || "";
  const isFargate = launchType === "FARGATE";
  const canRun = !!selectedRev && (!isFargate || net.ready) && count >= 1;

  const submit = () => {
    if (!canRun) return;
    const command = parseArgv(commandStr);
    const env = envRows.filter((r) => r.key.trim()).map((r) => ({ key: r.key, value: r.value }));
    const hasOverride = command.length > 0 || env.length > 0;
    run.mutate(
      {
        taskDefinition: selectedRev,
        count,
        launchType,
        subnets: isFargate ? net.subnets : [],
        securityGroups: isFargate ? net.securityGroups : [],
        assignPublicIp: isFargate ? net.assignPublicIp : false,
        containerName: hasOverride ? overrideContainer : undefined,
        command,
        env,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative max-h-[82vh] w-[560px] max-w-[92vw] overflow-auto rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          run task in <span className="text-accent">{cluster}</span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <Row label="family">
            <Select
              value={family}
              placeholder="select a family…"
              loading={families.isFetching}
              onOpen={() => void families.refetch()}
              onChange={(f) => {
                setFamily(f);
                setTaskDef("");
              }}
              options={(families.data ?? []).map((f) => ({ value: f, label: f }))}
            />
          </Row>

          <Row label="revision">
            <Select
              value={selectedRev}
              placeholder={family ? "select…" : "pick a family first"}
              loading={revisions.isFetching}
              onOpen={() => void revisions.refetch()}
              onChange={setTaskDef}
              options={revList.map((arn) => ({ value: arn, label: arnName(arn) }))}
            />
          </Row>

          <div className="flex gap-6">
            <Row label="count" width="w-20">
              <input
                value={count}
                inputMode="numeric"
                onChange={(e) => setCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                className="w-20 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
              />
            </Row>
            <Row label="launch type" width="w-24">
              <Select
                value={launchType}
                onChange={setLaunchType}
                options={[
                  { value: "FARGATE", label: "FARGATE" },
                  { value: "EC2", label: "EC2" },
                ]}
              />
            </Row>
          </div>

          {isFargate && (
            <NetworkConfigFields scope={scope} cluster={cluster} onChange={setNet} />
          )}

          {selectedRev && (
            <details className="rounded border border-border">
              <summary className="cursor-pointer px-3 py-1.5 text-fg-dim">
                command / env overrides (optional)
              </summary>
              <div className="flex flex-col gap-2 border-t border-border p-3">
                {containers.length > 1 && (
                  <Row label="container">
                    <Select
                      value={overrideContainer}
                      onChange={setContainerName}
                      options={containers.map((c) => ({ value: c.name, label: c.name }))}
                    />
                  </Row>
                )}
                <Row label="command">
                  <input
                    value={commandStr}
                    onChange={(e) => setCommandStr(e.target.value)}
                    placeholder="blank = image default · e.g. python manage.py migrate"
                    className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                  />
                </Row>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-fg-dim">env</span>
                    <button
                      type="button"
                      onClick={() => setEnvRows([...envRows, { key: "", value: "" }])}
                      className="text-fg-muted hover:text-accent"
                    >
                      + add
                    </button>
                  </div>
                  {envRows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 pl-[140px]">
                      <input
                        value={r.key}
                        placeholder="KEY"
                        onChange={(e) =>
                          setEnvRows(
                            envRows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                          )
                        }
                        className="w-40 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                      />
                      <input
                        value={r.value}
                        placeholder="value"
                        onChange={(e) =>
                          setEnvRows(
                            envRows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                          )
                        }
                        className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                      />
                      <IconButton
                        size="sm"
                        onClick={() => setEnvRows(envRows.filter((_, j) => j !== i))}
                        className="hover:!text-err"
                        aria-label="remove"
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}

          {run.isError && (
            <div className="text-[12px] text-err">
              {appErrorMessage(run.error as unknown as AppError)}
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
              disabled={!canRun || run.isPending}
              className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {run.isPending ? "running…" : `run ${count} task${count === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  width = "w-32",
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
