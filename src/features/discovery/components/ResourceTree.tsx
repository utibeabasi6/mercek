import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useClusterResources, useGraphs } from "@/features/discovery/api";
import { clusterTab, serviceTab, taskTab } from "@/features/discovery/tabs";
import { useShell, tabId } from "@/app/shell";
import { StatusGlyph } from "@/components/ui/Badge";
import { toneFor } from "@/lib/status";
import { arnName, shortAccount } from "@/lib/arn";
import type { Cluster, ResourceGraph, Service } from "@/types";

function serviceTone(svc: Service) {
  if (svc.deployments.some((d) => d.rolloutState === "in_progress")) return "warn" as const;
  return toneFor(svc.status);
}

interface RowProps {
  depth: number;
  label: string;
  glyph?: ReactNode;
  trailing?: ReactNode;
  expandable?: boolean;
  open?: boolean;
  active?: boolean;
  muted?: boolean;
  onToggle?: () => void;
  onActivate?: () => void;
}

function Row({
  depth,
  label,
  glyph,
  trailing,
  expandable,
  open,
  active,
  muted,
  onToggle,
  onActivate,
}: RowProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (expandable) onToggle?.();
        onActivate?.();
      }}
      className={`flex w-full items-center gap-1.5 py-[3px] pr-2 text-left hover:bg-bg-elev ${
        active ? "bg-bg-elev-2 text-fg" : muted ? "text-fg-muted" : "text-fg-dim"
      }`}
      style={{ paddingLeft: depth * 12 + 8 }}
    >
      <span className="flex w-3 shrink-0 justify-center text-fg-muted">
        {expandable ? open ? <ChevronDown size={12} /> : <ChevronRight size={12} /> : null}
      </span>
      {glyph}
      <span className="truncate" title={label}>
        {label}
      </span>
      {trailing != null && <span className="ml-auto shrink-0 text-fg-muted">{trailing}</span>}
    </button>
  );
}

function ClusterBranch({
  graph,
  cluster,
}: {
  graph: ResourceGraph;
  cluster: Cluster;
}) {
  const { openTab, activeTabId } = useShell();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState({ caps: false, services: true, tasks: false });
  const { data, isLoading } = useClusterResources(graph.scope, cluster.name, open);

  const services = data?.services ?? [];
  const tasks = data?.tasks ?? [];
  const toggle = (g: keyof typeof groups) => setGroups((s) => ({ ...s, [g]: !s[g] }));

  return (
    <>
      <Row
        depth={1}
        expandable
        open={open}
        onToggle={() => setOpen((o) => !o)}
        glyph={<StatusGlyph status={cluster.status} />}
        label={cluster.name}
        active={activeTabId === tabId("cluster", graph.scope, cluster.name)}
        onActivate={() => openTab(clusterTab(graph.scope, cluster))}
      />
      {open && (
        <>
          <Row
            depth={2}
            expandable
            open={groups.caps}
            onToggle={() => toggle("caps")}
            label="capacity providers"
            trailing={cluster.capacityProviders.length}
          />
          {groups.caps &&
            cluster.capacityProviders.map((cp) => (
              <Row key={cp} depth={3} glyph={<StatusGlyph tone="ok" />} label={cp} />
            ))}

          <Row
            depth={2}
            expandable
            open={groups.services}
            onToggle={() => toggle("services")}
            label="services"
            trailing={isLoading ? "…" : services.length}
          />
          {groups.services &&
            (isLoading ? (
              <Row depth={3} label="loading…" muted />
            ) : (
              services.map((s) => (
                <Row
                  key={s.arn}
                  depth={3}
                  glyph={<StatusGlyph tone={serviceTone(s)} />}
                  label={s.name}
                  trailing={
                    <span className="tabular-nums text-[11px]">
                      {s.running}/{s.desired}
                    </span>
                  }
                  active={activeTabId === tabId("service", graph.scope, `${s.cluster}/${s.name}`)}
                  onActivate={() => openTab(serviceTab(graph.scope, s))}
                />
              ))
            ))}

          <Row
            depth={2}
            expandable
            open={groups.tasks}
            onToggle={() => toggle("tasks")}
            label="tasks"
            trailing={isLoading ? "…" : tasks.length}
          />
          {groups.tasks &&
            (isLoading ? (
              <Row depth={3} label="loading…" muted />
            ) : (
              tasks.map((t) => (
                <Row
                  key={t.arn}
                  depth={3}
                  glyph={<StatusGlyph tone={toneFor(t.lastStatus)} />}
                  label={arnName(t.arn).slice(0, 12)}
                  trailing={<span className="text-[11px]">{t.service ?? "—"}</span>}
                  active={activeTabId === tabId("task", graph.scope, t.arn)}
                  onActivate={() => openTab(taskTab(graph.scope, t))}
                />
              ))
            ))}
        </>
      )}
    </>
  );
}

export function ResourceTree() {
  const { graphs, errors, isLoading, isFetching, fromCache, stale } = useGraphs();
  const [openAccounts, setOpenAccounts] = useState<Set<string>>(() => new Set());
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current || graphs.length === 0) return;
    setOpenAccounts(new Set(graphs.map(accKey)));
    seeded.current = true;
  }, [graphs]);

  const toggleAccount = (key: string) =>
    setOpenAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (graphs.length === 0) {
    return (
      <div className="px-3 py-4 text-fg-muted">
        {isLoading
          ? "discovering…"
          : errors.length > 0
            ? "discovery failed — see banner above"
            : "No scope active. Pick a profile above."}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {graphs.map((g) => {
        const aKey = accKey(g);
        const accOpen = openAccounts.has(aKey);
        return (
          <div key={aKey}>
            <Row
              depth={0}
              expandable
              open={accOpen}
              onToggle={() => toggleAccount(aKey)}
              glyph={<StatusGlyph tone="info" />}
              label={g.scope.profile}
              trailing={
                <span className="text-[11px]">
                  {shortAccount(g.accountId)} · {g.scope.region}
                </span>
              }
            />
            {accOpen &&
              g.clusters.map((c) => <ClusterBranch key={c.arn} graph={g} cluster={c} />)}
          </div>
        );
      })}
      {isFetching && <div className="px-3 py-1 text-[11px] text-fg-muted">refreshing…</div>}
      {(fromCache || stale) && !isFetching && (
        <div className="px-3 py-1 text-[11px] text-warn">cached — last good data</div>
      )}
    </div>
  );
}

const accKey = (g: ResourceGraph) => `acc:${g.scope.profile}:${g.scope.region}`;
