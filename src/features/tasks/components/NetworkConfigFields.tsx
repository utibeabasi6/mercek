import { useEffect, useMemo, useState } from "react";
import { useNetworkOptions } from "@/features/tasks/api";
import { useClusterResources } from "@/features/discovery/api";
import { Select } from "@/components/ui/Select";
import { MultiCheck } from "@/components/ui/MultiCheck";
import type { Scope } from "@/types";

export interface NetworkConfig {
  subnets: string[];
  securityGroups: string[];
  assignPublicIp: boolean;
  ready: boolean;
}

// The awsvpc network section shared by run-task and create-service. It fetches the
// region's VPCs/subnets/SGs once, guesses the cluster's VPC from a subnet its existing
// services already use (falling back to the default VPC), defaults to every subnet in
// that VPC plus its default security group, and lets the user adjust. Pushes the
// effective selection up via onChange.
export function NetworkConfigFields({
  scope,
  cluster,
  onChange,
}: {
  scope: Scope;
  cluster: string;
  onChange: (cfg: NetworkConfig) => void;
}) {
  const net = useNetworkOptions(scope);
  const { data: resources } = useClusterResources(scope, cluster);

  const vpcs = net.data?.vpcs ?? [];
  const allSubnets = useMemo(() => net.data?.subnets ?? [], [net.data]);
  const allSgs = useMemo(() => net.data?.securityGroups ?? [], [net.data]);

  const inferredVpc = useMemo(() => {
    const used = (resources?.services ?? []).flatMap(
      (s) => s.networkConfiguration?.awsvpcConfiguration?.subnets ?? [],
    );
    for (const id of used) {
      const match = allSubnets.find((x) => x.id === id);
      if (match) return match.vpcId;
    }
    return vpcs.find((v) => v.isDefault)?.id ?? vpcs[0]?.id ?? "";
  }, [resources, allSubnets, vpcs]);

  const [vpcId, setVpcId] = useState<string | null>(null);
  const effectiveVpc = vpcId ?? inferredVpc;

  const vpcSubnets = useMemo(
    () => allSubnets.filter((s) => s.vpcId === effectiveVpc),
    [allSubnets, effectiveVpc],
  );
  const vpcSgs = useMemo(() => allSgs.filter((g) => g.vpcId === effectiveVpc), [allSgs, effectiveVpc]);

  // null = untouched → use the default (all subnets / the VPC's default security group).
  const [subnetSel, setSubnetSel] = useState<string[] | null>(null);
  const [sgSel, setSgSel] = useState<string[] | null>(null);
  const [assignPublicIp, setAssignPublicIp] = useState(false);

  const subnets = subnetSel ?? vpcSubnets.map((s) => s.id);
  const securityGroups = sgSel ?? vpcSgs.filter((g) => g.name === "default").map((g) => g.id);

  const subnetsKey = subnets.join(",");
  const sgsKey = securityGroups.join(",");
  useEffect(() => {
    onChange({ subnets, securityGroups, assignPublicIp, ready: subnets.length > 0 });
    // Keyed on the joined ids so this only fires when the effective selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subnetsKey, sgsKey, assignPublicIp]);

  if (net.isLoading) {
    return <div className="text-[12px] text-fg-muted">loading networks…</div>;
  }
  if (net.isError || vpcs.length === 0) {
    return (
      <div className="text-[12px] text-fg-muted">
        couldn't load VPCs for this region — check the profile's EC2 permissions.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Row label="vpc">
        <Select
          value={effectiveVpc}
          onChange={(v) => {
            setVpcId(v);
            setSubnetSel(null);
            setSgSel(null);
          }}
          placeholder="select a VPC…"
          options={vpcs.map((v) => ({
            value: v.id,
            label: `${v.name ? `${v.name} · ` : ""}${v.id}${v.isDefault ? " (default)" : ""}`,
          }))}
        />
      </Row>
      <RowTop label="subnets">
        <MultiCheck
          options={vpcSubnets.map((s) => ({
            value: s.id,
            label: s.id,
            hint: [s.availabilityZone, s.cidr, s.name].filter(Boolean).join(" · "),
          }))}
          selected={subnets}
          onChange={setSubnetSel}
          empty="no subnets in this VPC"
        />
      </RowTop>
      <RowTop label="security groups">
        <MultiCheck
          options={vpcSgs.map((g) => ({
            value: g.id,
            label: g.id,
            hint: [g.name, g.description].filter(Boolean).join(" · "),
          }))}
          selected={securityGroups}
          onChange={setSgSel}
          empty="no security groups in this VPC"
        />
      </RowTop>
      <label className="flex items-center gap-2 pl-[128px] text-fg-dim">
        <input
          type="checkbox"
          checked={assignPublicIp}
          onChange={(e) => setAssignPublicIp(e.target.checked)}
        />
        assign public IP
      </label>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-fg-dim">{label}</span>
      {children}
    </div>
  );
}

function RowTop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-28 shrink-0 pt-1 text-fg-dim">{label}</span>
      {children}
    </div>
  );
}
