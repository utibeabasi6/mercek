import { useTargetHealth } from "@/features/services/api";
import { StatusBadge } from "@/components/ui/Badge";
import { Section } from "@/components/ui/Tabs";
import { toneFor } from "@/lib/status";
import { arnName } from "@/lib/arn";
import type { LoadBalancerRef, Scope, Service } from "@/types";

function TargetGroup({ scope, lb }: { scope: Scope; lb: LoadBalancerRef }) {
  const tgArn = lb.targetGroupArn ?? undefined;
  const { data, isLoading } = useTargetHealth(scope, tgArn);
  return (
    <Section title={`${tgArn ? arnName(tgArn) : "target group"} · ${lb.containerName}:${lb.containerPort}`}>
      {isLoading ? (
        <div className="text-fg-muted">loading…</div>
      ) : data && data.length > 0 ? (
        <table className="w-full max-w-3xl text-left">
          <thead className="text-[11px] uppercase text-fg-muted">
            <tr>
              <th className="py-1 font-normal">target</th>
              <th className="py-1 font-normal">port</th>
              <th className="py-1 font-normal">az</th>
              <th className="py-1 font-normal">state</th>
              <th className="py-1 font-normal">reason</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={`${t.targetId}:${t.port}`} className="border-t border-border">
                <td className="py-1 text-fg">{t.targetId}</td>
                <td className="py-1 tabular-nums text-fg-dim">{t.port ?? "—"}</td>
                <td className="py-1 text-fg-dim">{t.availabilityZone ?? "—"}</td>
                <td className="py-1">
                  <StatusBadge status={t.state} tone={toneFor(t.state)} />
                </td>
                <td className="py-1 text-fg-muted">{t.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-fg-muted">no registered targets</div>
      )}
    </Section>
  );
}

export function TargetsPanel({ scope, service }: { scope: Scope; service: Service }) {
  const lbs = service.loadBalancers.filter((lb) => lb.targetGroupArn);
  if (lbs.length === 0) {
    return <div className="text-fg-muted">no load balancers attached to this service</div>;
  }
  return (
    <div className="flex flex-col gap-6">
      {lbs.map((lb) => (
        <TargetGroup key={lb.targetGroupArn} scope={scope} lb={lb} />
      ))}
    </div>
  );
}
