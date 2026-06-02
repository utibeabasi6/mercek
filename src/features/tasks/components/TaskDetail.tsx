import { useState } from "react";
import type { Tab } from "@/app/shell";
import { useClusterResources, useTaskDefinition } from "@/features/discovery/api";
import { useEni } from "@/features/tasks/api";
import { SubTabs, Field, Section } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { toneFor } from "@/lib/status";
import { arnName, taskDefShort } from "@/lib/arn";
import { modLabel } from "@/app/keybindings";

export function TaskDetail({ tab }: { tab: Tab }) {
  const { data: resources, isLoading } = useClusterResources(tab.scope, tab.clusterName ?? "");
  const task = resources?.tasks.find((t) => t.arn === tab.taskArn) ?? null;
  const [sub, setSub] = useState("containers");
  const { data: taskDef } = useTaskDefinition(
    tab.scope,
    task?.taskDefArn,
    sub === "env" || sub === "volumes",
  );
  const { data: eni } = useEni(tab.scope, task?.networking?.eniId, sub === "networking");

  if (!task) {
    return (
      <div className="p-6 text-fg-muted">
        {isLoading ? "loading task…" : `task ${tab.label} not found`}
      </div>
    );
  }

  const net = task.networking;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 py-3">
        <h2 className="text-fg">{arnName(task.arn).slice(0, 16)}</h2>
        <StatusBadge status={task.lastStatus} tone={toneFor(task.lastStatus)} />
        <span className="text-[12px] text-fg-muted">
          {task.service ?? "—"} · {task.cluster}
        </span>
        <button
          type="button"
          disabled
          title="write paths land in Phase 2"
          className="ml-auto cursor-not-allowed rounded border border-border px-2 py-1 text-fg-muted opacity-70"
        >
          stop task
        </button>
      </header>

      <SubTabs
        tabs={[
          { id: "containers", label: `containers (${task.containers.length})` },
          { id: "env", label: "env" },
          { id: "networking", label: "networking" },
          { id: "volumes", label: "volumes" },
          { id: "logs", label: "logs" },
        ]}
        active={sub}
        onChange={setSub}
      />

      <div className="flex-1 overflow-auto p-4">
        {sub === "containers" && (
          <div className="flex flex-col gap-3">
            {task.containers.map((c) => (
              <div key={c.name} className="rounded border border-border p-3">
                <div className="flex items-center gap-3">
                  <span className="text-fg">{c.name}</span>
                  <StatusBadge status={c.lastStatus} tone={toneFor(c.lastStatus)} />
                  {c.exitCode != null && (
                    <span className="text-err">exit {c.exitCode}</span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-2">
                  <Field label="image">
                    <span className="break-all">{c.image}</span>
                  </Field>
                  <Field label="health">{c.health}</Field>
                  <Field label="ports">
                    {c.networkBindings.length
                      ? c.networkBindings
                          .map((b) => `${b.containerPort}/${b.protocol}`)
                          .join(", ")
                      : "none"}
                  </Field>
                  <Field label="log group">{c.logGroup ?? "—"}</Field>
                </div>
                {c.reason && <div className="mt-2 text-err">{c.reason}</div>}
              </div>
            ))}
          </div>
        )}

        {sub === "networking" &&
          (net ? (
            <div className="flex flex-col gap-5">
              <div className="grid max-w-2xl grid-cols-2 gap-x-8 gap-y-3">
                <Field label="eni">{net.eniId ?? "—"}</Field>
                <Field label="status">{eni?.status ?? "—"}</Field>
                <Field label="private ip">{eni?.privateIp ?? net.privateIp ?? "—"}</Field>
                <Field label="public ip">{eni?.publicIp ?? net.publicIp ?? "—"}</Field>
                <Field label="subnet">{eni?.subnetId ?? net.subnet ?? "—"}</Field>
                <Field label="vpc">{eni?.vpcId ?? net.vpc ?? "—"}</Field>
                <Field label="availability zone">{eni?.availabilityZone ?? "—"}</Field>
                <Field label="interface type">{eni?.interfaceType ?? "—"}</Field>
              </div>
              <Section title="security groups">
                {eni && eni.securityGroups.length > 0 ? (
                  <div className="flex max-w-2xl flex-col">
                    {eni.securityGroups.map((sg) => (
                      <div
                        key={sg.id}
                        className="flex items-center gap-3 border-t border-border py-1.5"
                      >
                        <span className="w-56 text-fg">{sg.id}</span>
                        <span className="text-fg-dim">{sg.name ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                ) : net.securityGroups.length > 0 ? (
                  <div className="text-fg-dim">{net.securityGroups.join(", ")}</div>
                ) : (
                  <div className="text-fg-muted">resolving from EC2…</div>
                )}
              </Section>
            </div>
          ) : (
            <div className="text-fg-muted">no network interface attached</div>
          ))}

        {sub === "env" && (
          <div className="flex flex-col gap-6">
            {!taskDef && (
              <div className="text-fg-muted">
                task definition {taskDefShort(task.taskDefArn)} not loaded
              </div>
            )}
            {taskDef?.containerDefs.map((cd) => (
              <Section key={cd.name} title={`${cd.name} · environment`}>
                {cd.env.length === 0 && cd.secrets.length === 0 ? (
                  <div className="text-fg-muted">no environment configured</div>
                ) : (
                  <table className="w-full max-w-3xl text-left">
                    <tbody>
                      {cd.env.map((e) => (
                        <tr key={`e-${e.key}`} className="border-t border-border">
                          <td className="w-64 py-1 pr-4 align-top text-fg-dim">{e.key}</td>
                          <td className="break-all py-1 text-fg">{e.value}</td>
                        </tr>
                      ))}
                      {cd.secrets.map((s) => (
                        <tr key={`s-${s.key}`} className="border-t border-border">
                          <td className="w-64 py-1 pr-4 align-top text-fg-dim">
                            {s.key} <span className="text-warn">secret</span>
                          </td>
                          <td className="py-1">
                            <span className="text-fg-muted">•••••••• </span>
                            <span className="break-all text-[11px] text-fg-muted">
                              {s.sourceArn}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>
            ))}
          </div>
        )}

        {sub === "volumes" && (
          <div className="flex flex-col gap-6">
            <Section title="volumes">
              {taskDef && taskDef.volumes.length > 0 ? (
                <table className="w-full max-w-2xl text-left">
                  <thead className="text-[11px] uppercase text-fg-muted">
                    <tr>
                      <th className="py-1 font-normal">name</th>
                      <th className="py-1 font-normal">source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskDef.volumes.map((v) => (
                      <tr key={v.name} className="border-t border-border">
                        <td className="py-1 text-fg">{v.name}</td>
                        <td className="py-1 text-fg-dim">
                          {v.hostPath ??
                            v.efsVolumeConfiguration?.fileSystemId ??
                            (v.dockerVolumeConfiguration ? "docker" : "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-fg-muted">no volumes defined</div>
              )}
            </Section>
            <Section title="mount points">
              {taskDef &&
              taskDef.containerDefs.some((cd) => cd.mountPoints.length > 0) ? (
                <div className="flex flex-col gap-1">
                  {taskDef.containerDefs.flatMap((cd) =>
                    cd.mountPoints.map((m, i) => (
                      <div
                        key={`${cd.name}-${i}`}
                        className="flex items-center gap-3 border-b border-border py-1.5"
                      >
                        <span className="w-40 truncate text-fg">{cd.name}</span>
                        <span className="text-fg-dim">{m.sourceVolume ?? "—"}</span>
                        <span className="text-fg-muted">→</span>
                        <span className="text-fg-dim">{m.containerPath ?? "—"}</span>
                        {m.readOnly && <span className="text-[11px] text-fg-muted">ro</span>}
                      </div>
                    )),
                  )}
                </div>
              ) : (
                <div className="text-fg-muted">no mount points</div>
              )}
            </Section>
          </div>
        )}

        {sub === "logs" && (
          <div className="text-fg-muted">
            Live per-container log tail runs in the bottom drawer — toggle it with {modLabel} B.
          </div>
        )}
      </div>
    </div>
  );
}
