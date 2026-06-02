import { useScaling } from "@/features/services/api";
import { Field, Section } from "@/components/ui/Tabs";
import type { Scope } from "@/types";

export function ScalingPanel({
  scope,
  cluster,
  service,
}: {
  scope: Scope;
  cluster: string;
  service: string;
}) {
  const { data, isLoading } = useScaling(scope, cluster, service);

  if (isLoading) return <div className="text-fg-muted">loading…</div>;
  if (!data || (data.targets.length === 0 && data.policies.length === 0)) {
    return <div className="text-fg-muted">no auto scaling configured for this service</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="scalable target">
        {data.targets.map((t) => (
          <div key={t.resourceId} className="flex flex-wrap gap-x-10 gap-y-3">
            <Field label="min capacity">{t.minCapacity}</Field>
            <Field label="max capacity">{t.maxCapacity}</Field>
            <Field label="dimension">{t.scalableDimension}</Field>
          </div>
        ))}
      </Section>

      <Section title={`policies (${data.policies.length})`}>
        <table className="w-full max-w-3xl text-left">
          <thead className="text-[11px] uppercase text-fg-muted">
            <tr>
              <th className="py-1 font-normal">name</th>
              <th className="py-1 font-normal">type</th>
              <th className="py-1 font-normal">metric</th>
              <th className="py-1 font-normal">target</th>
              <th className="py-1 font-normal">cooldown in/out</th>
            </tr>
          </thead>
          <tbody>
            {data.policies.map((p) => (
              <tr key={p.policyArn} className="border-t border-border">
                <td className="py-1 text-fg">{p.name}</td>
                <td className="py-1 text-fg-dim">{p.kind}</td>
                <td className="py-1 text-fg-dim">{p.predefinedMetric ?? "—"}</td>
                <td className="py-1 tabular-nums text-fg-dim">{p.targetValue ?? "—"}</td>
                <td className="py-1 tabular-nums text-fg-dim">
                  {p.scaleInCooldown ?? "—"} / {p.scaleOutCooldown ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
