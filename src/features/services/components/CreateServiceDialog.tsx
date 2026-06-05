import { useState } from "react";
import {
  useTaskDefFamilies,
  useTaskDefinition,
  useTaskDefinitionRevisions,
} from "@/features/discovery/api";
import { useCreateService } from "@/features/services/api";
import {
  NetworkConfigFields,
  type NetworkConfig,
} from "@/features/tasks/components/NetworkConfigFields";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import { arnName } from "@/lib/arn";
import type { AppError, Scope } from "@/types";

export function CreateServiceDialog({
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
  const [name, setName] = useState("");
  const [desired, setDesired] = useState(1);
  const [launchType, setLaunchType] = useState("FARGATE");
  const [net, setNet] = useState<NetworkConfig>({
    subnets: [],
    securityGroups: [],
    assignPublicIp: false,
    ready: false,
  });
  const [useLb, setUseLb] = useState(false);
  const [targetGroupArn, setTargetGroupArn] = useState("");
  const [lbContainer, setLbContainer] = useState("");
  const [lbPort, setLbPort] = useState("");
  const create = useCreateService(scope, cluster);

  const revList = revisions.data ?? [];
  const selectedRev = taskDef && revList.includes(taskDef) ? taskDef : (revList[0] ?? "");
  const td = useTaskDefinition(scope, selectedRev || undefined, !!selectedRev);
  const containers = td.data?.containerDefs ?? [];
  const lbContainerName = lbContainer || containers[0]?.name || "";
  const isFargate = launchType === "FARGATE";

  const lbValid = !useLb || (!!targetGroupArn.trim() && !!lbContainerName && Number(lbPort) > 0);
  const canCreate =
    !!name.trim() &&
    !!selectedRev &&
    desired >= 0 &&
    (!isFargate || net.ready) &&
    lbValid &&
    !create.isPending;

  const submit = () => {
    if (!canCreate) return;
    create.mutate(
      {
        name: name.trim(),
        taskDefinition: selectedRev,
        desiredCount: desired,
        launchType,
        subnets: isFargate ? net.subnets : [],
        securityGroups: isFargate ? net.securityGroups : [],
        assignPublicIp: isFargate ? net.assignPublicIp : false,
        targetGroupArn: useLb ? targetGroupArn.trim() : undefined,
        containerName: useLb ? lbContainerName : undefined,
        containerPort: useLb ? Number(lbPort) : undefined,
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
        className="relative max-h-[84vh] w-[560px] max-w-[92vw] overflow-auto rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">
          create service in <span className="text-accent">{cluster}</span>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <Row label="name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="service name"
              className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
            />
          </Row>

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
            <Row label="desired" width="w-24">
              <input
                value={desired}
                inputMode="numeric"
                onChange={(e) => setDesired(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
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

          {isFargate && <NetworkConfigFields scope={scope} cluster={cluster} onChange={setNet} />}

          <details className="rounded border border-border">
            <summary
              className="cursor-pointer px-3 py-1.5 text-fg-dim"
              onClick={() => setUseLb((v) => !v)}
            >
              load balancer (optional)
            </summary>
            <div className="flex flex-col gap-2 border-t border-border p-3">
              <label className="flex items-center gap-2 text-fg-dim">
                <input type="checkbox" checked={useLb} onChange={(e) => setUseLb(e.target.checked)} />
                attach to a target group
              </label>
              {useLb && (
                <>
                  <Row label="target group">
                    <input
                      value={targetGroupArn}
                      onChange={(e) => setTargetGroupArn(e.target.value)}
                      placeholder="arn:aws:elasticloadbalancing:…:targetgroup/…"
                      className="min-w-0 flex-1 rounded border border-border bg-bg-elev-2 px-2 py-1 font-mono text-[12px] text-fg outline-none focus:border-accent"
                    />
                  </Row>
                  <Row label="container">
                    <Select
                      value={lbContainerName}
                      onChange={setLbContainer}
                      placeholder={selectedRev ? "select…" : "pick a revision first"}
                      options={containers.map((c) => ({ value: c.name, label: c.name }))}
                    />
                  </Row>
                  <Row label="container port">
                    <input
                      value={lbPort}
                      inputMode="numeric"
                      onChange={(e) => setLbPort(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="80"
                      className="w-24 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
                    />
                  </Row>
                </>
              )}
            </div>
          </details>

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
              {create.isPending ? "creating…" : "create service"}
            </button>
          </div>
        </div>
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
