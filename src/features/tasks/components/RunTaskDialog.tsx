import { useState } from "react";
import { useTaskDefFamilies, useTaskDefinitionRevisions } from "@/features/discovery/api";
import { useRunTask } from "@/features/tasks/api";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import { arnName } from "@/lib/arn";
import type { AppError, Scope } from "@/types";

const parseList = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

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
  const [subnetsStr, setSubnetsStr] = useState("");
  const [sgsStr, setSgsStr] = useState("");
  const [assignPublicIp, setAssignPublicIp] = useState(false);
  const run = useRunTask(scope, cluster);

  const revList = revisions.data ?? [];
  const selectedRev = taskDef && revList.includes(taskDef) ? taskDef : (revList[0] ?? "");
  const isFargate = launchType === "FARGATE";
  const subnets = parseList(subnetsStr);
  const canRun = !!selectedRev && (!isFargate || subnets.length > 0) && count >= 1;

  const submit = () => {
    if (!canRun) return;
    run.mutate(
      {
        taskDefinition: selectedRev,
        count,
        launchType,
        subnets,
        securityGroups: parseList(sgsStr),
        assignPublicIp,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[560px] max-w-[92vw] rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
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
            <>
              <Row label="subnets">
                <input
                  value={subnetsStr}
                  onChange={(e) => setSubnetsStr(e.target.value)}
                  placeholder="subnet-… , subnet-…"
                  className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                />
              </Row>
              <Row label="security groups">
                <input
                  value={sgsStr}
                  onChange={(e) => setSgsStr(e.target.value)}
                  placeholder="sg-… , sg-…"
                  className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                />
              </Row>
              <label className="flex items-center gap-2 pl-[136px] text-fg-dim">
                <input
                  type="checkbox"
                  checked={assignPublicIp}
                  onChange={(e) => setAssignPublicIp(e.target.checked)}
                />
                assign public IP
              </label>
            </>
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
