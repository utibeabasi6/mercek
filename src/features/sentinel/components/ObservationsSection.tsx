import { Section } from "@/components/ui/Tabs";
import { useObservations } from "@/features/sentinel/store";
import { ObservationList } from "@/features/sentinel/components/ObservationList";
import type { Scope } from "@/types";

// The sentinel's findings for one resource, shown on its overview. A cluster shows
// every finding in it; a service shows only its own.
export function ObservationsSection({
  scope,
  cluster,
  service,
}: {
  scope: Scope;
  cluster: string;
  service?: string;
}) {
  const items = useObservations().filter(
    (o) =>
      o.scope.profile === scope.profile &&
      o.scope.region === scope.region &&
      o.cluster === cluster &&
      (service ? o.service === service : true),
  );

  return (
    <Section title={`observations${items.length ? ` (${items.length})` : ""}`}>
      <div className="max-w-2xl overflow-hidden rounded border border-border">
        <ObservationList items={items} />
      </div>
    </Section>
  );
}
