import { useMemo, type CSSProperties } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useShell } from "@/app/shell";
import { useClusterResources } from "@/features/discovery/api";
import { serviceTab } from "@/features/discovery/tabs";
import { LoadingState, EmptyState } from "@/components/ui/StateView";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { taskDefShort } from "@/lib/arn";
import type { EnvVar, Scope, Service, TaskDefinition } from "@/types";

// Cloud-Map-free topology: what talks to what, assembled from signals the console
// doesn't correlate — ALB/target-group attachments (the ingress tier) and task-def
// env vars (most clusters don't use Cloud Map, but everyone has connection URLs).

const INFRA: { re: RegExp; kind: string }[] = [
  { re: /redis/i, kind: "redis" },
  { re: /postgres|postgresql|psql/i, kind: "postgres" },
  { re: /mysql|mariadb/i, kind: "mysql" },
  { re: /mongo/i, kind: "mongodb" },
  { re: /kafka|msk/i, kind: "kafka" },
  { re: /rabbit|amqp/i, kind: "rabbitmq" },
  { re: /memcache/i, kind: "memcached" },
  { re: /elastic|opensearch/i, kind: "search" },
  { re: /dynamodb/i, kind: "dynamodb" },
];

const CONN_KEY = /_(URL|URI|HOST|HOSTNAME|ENDPOINT|ADDR|ADDRESS|DSN|BROKERS?|SERVERS?)$/i;

function extractHosts(value: string): string[] {
  const out = new Set<string>();
  for (const m of value.matchAll(/[a-z][\w+.-]*:\/\/([^/?#:\s"',]+)/gi)) {
    out.add(m[1].split("@").pop() ?? m[1]); // strip user:pass@
  }
  for (const m of value.matchAll(/\b([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+):\d{2,5}\b/gi)) {
    out.add(m[1]);
  }
  return [...out];
}

interface Dep {
  id: string;
  label: string;
  kind: "service" | "infra" | "external";
  category: string; // cache | database | queue | search | external | service
  via: string; // the env-var key that revealed this edge — shown as the edge label
}

function hostMatchesService(host: string, name: string): boolean {
  const labels = host.toLowerCase().split(".");
  return labels.includes(name.toLowerCase());
}

function infraCategory(kind: string): string {
  if (kind === "redis" || kind === "memcached") return "cache";
  if (kind === "kafka" || kind === "rabbitmq") return "queue";
  if (kind === "search") return "search";
  return "database";
}

function inferDeps(env: EnvVar[], services: Service[], self: string): Dep[] {
  const deps = new Map<string, Dep>();
  for (const { key, value } of env) {
    if (!CONN_KEY.test(key) && !/:\/\//.test(value)) continue;
    for (const host of extractHosts(value)) {
      if (/^(localhost|127\.|0\.0\.0\.0|::1)/.test(host)) continue;
      const svc = services.find((s) => s.name !== self && hostMatchesService(host, s.name));
      if (svc) {
        const id = `svc:${svc.name}`;
        if (!deps.has(id)) deps.set(id, { id, label: svc.name, kind: "service", category: "service", via: key });
        continue;
      }
      const infra = INFRA.find((x) => x.re.test(key) || x.re.test(host));
      if (infra) {
        const id = `infra:${infra.kind}`;
        if (!deps.has(id))
          deps.set(id, { id, label: infra.kind, kind: "infra", category: infraCategory(infra.kind), via: key });
        continue;
      }
      const id = `ext:${host}`;
      if (!deps.has(id)) deps.set(id, { id, label: host, kind: "external", category: "external", via: key });
    }
  }
  return [...deps.values()];
}

// ---- task-def derived facts shown on a service card -------------------------

function shortTg(arn: string): string {
  const m = arn.match(/targetgroup\/([^/]+)/);
  return m ? m[1] : (arn.split("/").pop() ?? arn);
}

function launchLabel(s: Service): string {
  const lt = (s.launchType ?? s.capacityProviderStrategy[0]?.capacityProvider ?? "").toUpperCase();
  if (lt.includes("FARGATE")) return "Fargate";
  if (lt.includes("EC2")) return "EC2";
  return lt || "—";
}

function isSpot(s: Service): boolean {
  const spot = (c: { capacityProvider: string }) => /SPOT/i.test(c.capacityProvider);
  return (
    s.capacityProviderStrategy.some(spot) ||
    s.deployments.some((d) => d.capacityProviderStrategy.some(spot))
  );
}

function serviceTone(s: Service): "ok" | "warn" | "err" {
  if (s.deployments.some((d) => d.rolloutState === "failed")) return "err";
  if (s.running < s.desired || s.pending > 0) return "warn";
  return "ok";
}

function fmtVcpu(units: number): string {
  const v = units / 1024;
  return v < 1 ? v.toFixed(2) : String(v);
}

function sizeLabel(td?: TaskDefinition): string {
  if (!td) return "";
  const cpuUnits = Number(td.cpu) || td.containerDefs.reduce((a, c) => a + (c.cpu || 0), 0);
  const miB = Number(td.memory) || td.containerDefs.reduce((a, c) => a + (c.memory ?? 0), 0);
  const parts: string[] = [];
  if (cpuUnits) parts.push(`${fmtVcpu(cpuUnits)} vCPU`);
  if (miB) parts.push(miB >= 1024 ? `${(miB / 1024).toFixed(miB % 1024 ? 1 : 0)} GiB` : `${miB} MiB`);
  return parts.join(" · ");
}

function servicePorts(td: TaskDefinition | undefined, lbPorts: number[]): number[] {
  const set = new Set<number>(lbPorts);
  td?.containerDefs.forEach((c) =>
    c.portMappings.forEach((p) => {
      if (p.containerPort) set.add(p.containerPort);
    }),
  );
  return [...set].sort((a, b) => a - b).slice(0, 4);
}

// ---- custom nodes -----------------------------------------------------------

const HANDLE: CSSProperties = { width: 6, height: 6, background: "var(--border-strong)", border: "none" };

interface ServiceData {
  name: string;
  running: number;
  desired: number;
  pending: number;
  tone: "ok" | "warn" | "err";
  launch: string;
  spot: boolean;
  rev: string;
  size: string;
  ports: number[];
  deploying: boolean;
}

function ServiceNode({ data }: NodeProps) {
  const d = data as unknown as ServiceData;
  const border = d.tone === "err" ? "border-err/70" : d.tone === "warn" ? "border-warn/70" : "border-accent/60";
  const stat = d.tone === "err" ? "text-err" : d.tone === "warn" ? "text-warn" : "text-ok";
  return (
    <div
      className={`w-[214px] cursor-pointer rounded-md border ${border} bg-bg-elev px-2.5 py-2 font-mono text-[11px] leading-tight shadow-sm`}
    >
      <Handle type="target" position={Position.Left} style={HANDLE} />
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-semibold text-fg">{d.name}</span>
        {d.deploying && (
          <span className="shrink-0 rounded bg-warn/15 px-1 text-[9px] uppercase tracking-wide text-warn">
            deploy
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className={`tabular-nums ${stat}`}>
          {d.running}/{d.desired}
          {d.pending > 0 ? ` +${d.pending}` : ""} tasks
        </span>
        <span className="text-fg-muted">
          {d.launch}
          {d.spot ? " · spot" : ""}
        </span>
      </div>
      {(d.size || d.ports.length > 0) && (
        <div className="mt-0.5 flex items-center justify-between text-fg-muted">
          <span className="truncate">{d.size}</span>
          {d.ports.length > 0 && (
            <span className="shrink-0 tabular-nums">{d.ports.map((p) => `:${p}`).join(" ")}</span>
          )}
        </div>
      )}
      <div className="truncate text-fg-muted">{d.rev}</div>
      <Handle type="source" position={Position.Right} style={HANDLE} />
    </div>
  );
}

const CAT_COLOR: Record<string, string> = {
  database: "text-info",
  cache: "text-warn",
  queue: "text-accent",
  search: "text-ok",
  external: "text-fg-dim",
};

interface DepData {
  label: string;
  category: string;
}

function DepNode({ data }: NodeProps) {
  const d = data as unknown as DepData;
  return (
    <div className="w-[150px] rounded-md border border-border bg-bg-elev px-2.5 py-1.5 font-mono text-[11px] leading-tight">
      <Handle type="target" position={Position.Left} style={HANDLE} />
      <div className={`text-[9px] uppercase tracking-wide ${CAT_COLOR[d.category] ?? "text-fg-muted"}`}>
        {d.category}
      </div>
      <div className="truncate text-fg">{d.label}</div>
      <Handle type="source" position={Position.Right} style={HANDLE} />
    </div>
  );
}

interface GatewayData {
  icon: string;
  label: string;
  sub?: string;
}

function GatewayNode({ data }: NodeProps) {
  const d = data as unknown as GatewayData;
  return (
    <div className="w-[160px] rounded-md border border-ok/60 bg-bg-elev px-2.5 py-1.5 font-mono text-[11px] leading-tight">
      <Handle type="target" position={Position.Left} style={HANDLE} />
      <div className="flex items-center gap-1.5">
        <span className="text-ok">{d.icon}</span>
        <span className="min-w-0 truncate text-fg">{d.label}</span>
      </div>
      {d.sub && <div className="truncate text-fg-muted">{d.sub}</div>}
      <Handle type="source" position={Position.Right} style={HANDLE} />
    </div>
  );
}

const nodeTypes: NodeTypes = { service: ServiceNode, dep: DepNode, gateway: GatewayNode };

function mkEdge(id: string, source: string, target: string, label?: string, animated = false): Edge {
  const e: Edge = {
    id,
    source,
    target,
    animated,
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border-strong)", width: 14, height: 14 },
    style: { stroke: "var(--border-strong)" },
  };
  if (label) {
    e.label = label;
    e.labelStyle = { fill: "var(--fg-muted)", fontSize: 10, fontFamily: "monospace" };
    e.labelBgStyle = { fill: "var(--bg)", fillOpacity: 0.85 };
    e.labelBgPadding = [3, 1];
  }
  return e;
}

export function TopologyView({ scope, cluster }: { scope: Scope; cluster: string }) {
  const { openTab } = useShell();
  const { data: resources, isLoading } = useClusterResources(scope, cluster, true, false);
  const services = useMemo(() => resources?.services ?? [], [resources]);

  const tds = useQueries({
    queries: services.map((s) => ({
      queryKey: qk.taskDefinition(scope, s.taskDefArn),
      queryFn: () => invoke("task_definition", { scope, arn: s.taskDefArn }),
      enabled: !!s.taskDefArn,
      staleTime: Infinity,
    })),
  });

  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, Node>();
    const edgeMap = new Map<string, Edge>();
    const addNode = (n: Node) => {
      if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
    };
    const addEdge = (e: Edge) => {
      if (!edgeMap.has(e.id)) edgeMap.set(e.id, e);
    };
    if (services.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const COL = { net: 0, tg: 220, svc: 470, dep: 790 };
    const SVC_Y = 132;
    const svcY = (i: number) => i * SVC_Y;
    const mid = ((services.length - 1) * SVC_Y) / 2;

    const hasIngress = services.some((s) => s.loadBalancers.length > 0);
    if (hasIngress) {
      addNode({
        id: "net",
        type: "gateway",
        position: { x: COL.net, y: mid },
        data: { icon: "⊕", label: "internet", sub: "inbound" },
      });
    }

    // Services + the ingress chain: internet → target group → service.
    const tgOrder: string[] = [];
    services.forEach((s, i) => {
      const td = tds[i]?.data as TaskDefinition | undefined;
      const lbPorts = s.loadBalancers.map((lb) => lb.containerPort);
      addNode({
        id: `svc:${s.name}`,
        type: "service",
        position: { x: COL.svc, y: svcY(i) },
        data: {
          name: s.name,
          running: s.running,
          desired: s.desired,
          pending: s.pending,
          tone: serviceTone(s),
          launch: launchLabel(s),
          spot: isSpot(s),
          rev: taskDefShort(s.taskDefArn),
          size: sizeLabel(td),
          ports: servicePorts(td, lbPorts),
          deploying: s.deployments.some((d) => d.rolloutState === "in_progress"),
        },
      });

      s.loadBalancers.forEach((lb) => {
        if (lb.targetGroupArn) {
          const tgId = `tg:${lb.targetGroupArn}`;
          if (!tgOrder.includes(tgId)) tgOrder.push(tgId);
          addNode({
            id: tgId,
            type: "gateway",
            position: { x: COL.tg, y: 0 },
            data: { icon: "◉", label: shortTg(lb.targetGroupArn), sub: lb.loadBalancerName ?? "target group" },
          });
          addEdge(mkEdge(`net->${tgId}`, "net", tgId));
          addEdge(mkEdge(`${tgId}->${s.name}`, tgId, `svc:${s.name}`, `${lb.containerName}:${lb.containerPort}`));
        } else {
          addEdge(mkEdge(`net->${s.name}`, "net", `svc:${s.name}`, lb.containerPort ? `:${lb.containerPort}` : undefined));
        }
      });
    });
    tgOrder.forEach((tgId, j) => {
      const n = nodeMap.get(tgId);
      if (n) n.position = { x: COL.tg, y: j * SVC_Y + 20 };
    });

    // Dependency edges inferred from env (service → service | infra | external).
    const depOrder: string[] = [];
    services.forEach((s, i) => {
      const env = (tds[i]?.data as TaskDefinition | undefined)?.containerDefs.flatMap((c) => c.env) ?? [];
      for (const d of inferDeps(env, services, s.name)) {
        const target = d.kind === "service" ? `svc:${d.label}` : d.id;
        if (d.kind !== "service") {
          if (!depOrder.includes(d.id)) depOrder.push(d.id);
          addNode({
            id: d.id,
            type: "dep",
            position: { x: COL.dep, y: 0 },
            data: { label: d.label, category: d.category },
          });
        }
        addEdge(mkEdge(`${s.name}=>${d.id}`, `svc:${s.name}`, target, d.via, d.kind === "service"));
      }
    });
    depOrder.forEach((id, j) => {
      const n = nodeMap.get(id);
      if (n) n.position = { x: COL.dep, y: j * 76 };
    });

    return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
  }, [services, tds]);

  if (isLoading && services.length === 0) return <LoadingState label="loading topology…" />;
  if (services.length === 0) return <EmptyState label="no services in this cluster" />;

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => {
          if (node.id.startsWith("svc:")) {
            const svc = services.find((s) => `svc:${s.name}` === node.id);
            if (svc) openTab(serviceTab(scope, svc));
          }
        }}
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background color="var(--border)" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor="#7c7c7c"
          maskColor="rgba(0,0,0,0.18)"
          className="!rounded !border !border-border"
          style={{ background: "var(--bg-elev)" }}
        />
        <Panel
          position="top-left"
          className="!m-2 rounded border border-border bg-bg/80 px-2 py-1.5 text-[10px] leading-snug text-fg-muted backdrop-blur"
        >
          <div className="flex flex-col gap-0.5">
            <span>
              <span className="text-ok">●</span> healthy
            </span>
            <span>
              <span className="text-warn">●</span> deploying / degraded
            </span>
            <span>
              <span className="text-err">●</span> rollout failed
            </span>
            <span className="text-fg-dim">edges ← task-def env · click a service to open it</span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
