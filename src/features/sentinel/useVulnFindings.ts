import { useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { parseEcrImage } from "@/features/images/parse";
import type { DetectedObservation } from "@/features/sentinel/store";
import type { ScopeResources } from "@/features/sentinel/detect";
import type { ImageScan, Scope, TaskDefinition } from "@/types";

const tdKey = (s: Scope, arn: string) => `${s.profile}:${s.region}:${arn}`;
const imgKey = (s: Scope, repo: string, ref: string) => `${s.profile}:${s.region}:${repo}:${ref}`;

// Fetches each service's task definition, then the ECR scan for each container image,
// and emits a "vuln" observation for any service whose images carry unresolved
// critical/high findings. Both layers reuse the shared, cached queries (task defs are
// immutable; scans cache for minutes), so steady-state cost is low.
export function useVulnFindings(graphs: ScopeResources[]): DetectedObservation[] {
  // 1. Unique task-def ARNs across all services.
  const tdRefs: { scope: Scope; arn: string }[] = [];
  const seenTd = new Set<string>();
  for (const g of graphs) {
    for (const s of g.services) {
      if (!s.taskDefArn) continue;
      const k = tdKey(g.scope, s.taskDefArn);
      if (!seenTd.has(k)) {
        seenTd.add(k);
        tdRefs.push({ scope: g.scope, arn: s.taskDefArn });
      }
    }
  }
  const tdQueries = useQueries({
    queries: tdRefs.map((r) => ({
      queryKey: qk.taskDefinition(r.scope, r.arn),
      queryFn: () => invoke("task_definition", { scope: r.scope, arn: r.arn }),
      staleTime: Infinity,
    })),
  });
  const tdByArn = new Map<string, TaskDefinition>();
  tdRefs.forEach((r, i) => {
    const d = tdQueries[i]?.data;
    if (d) tdByArn.set(tdKey(r.scope, r.arn), d);
  });

  // 2. Unique ECR images from those task defs.
  const imgRefs: { scope: Scope; repository: string; reference: string }[] = [];
  const seenImg = new Set<string>();
  for (const g of graphs) {
    for (const s of g.services) {
      const td = tdByArn.get(tdKey(g.scope, s.taskDefArn));
      for (const c of td?.containerDefs ?? []) {
        const ecr = parseEcrImage(c.image);
        if (!ecr) continue;
        const k = imgKey(g.scope, ecr.repository, ecr.reference);
        if (!seenImg.has(k)) {
          seenImg.add(k);
          imgRefs.push({ scope: g.scope, repository: ecr.repository, reference: ecr.reference });
        }
      }
    }
  }
  const scanQueries = useQueries({
    queries: imgRefs.map((r) => ({
      queryKey: ["imageScan", r.scope.profile, r.scope.region, r.repository, r.reference],
      queryFn: () =>
        invoke("image_scan", { scope: r.scope, repository: r.repository, reference: r.reference }),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const scanByKey = new Map<string, ImageScan>();
  imgRefs.forEach((r, i) => {
    const d = scanQueries[i]?.data;
    if (d) scanByKey.set(imgKey(r.scope, r.repository, r.reference), d);
  });

  // 3. Per service, sum critical/high across its ECR images.
  const out: DetectedObservation[] = [];
  for (const g of graphs) {
    for (const s of g.services) {
      const td = tdByArn.get(tdKey(g.scope, s.taskDefArn));
      let critical = 0;
      let high = 0;
      for (const c of td?.containerDefs ?? []) {
        const ecr = parseEcrImage(c.image);
        if (!ecr) continue;
        const scan = scanByKey.get(imgKey(g.scope, ecr.repository, ecr.reference));
        if (scan && scan.scanStatus === "COMPLETE") {
          critical += scan.critical;
          high += scan.high;
        }
      }
      if (critical > 0 || high > 0) {
        out.push({
          id: `${g.scope.profile}:${g.scope.region}:${s.cluster}:${s.name}:vuln`,
          kind: "vuln",
          severity: critical > 0 ? "critical" : "warn",
          scope: g.scope,
          cluster: s.cluster,
          service: s.name,
          title: `${s.name} — ${critical} critical${high ? `, ${high} high` : ""} vuln${
            critical + high === 1 ? "" : "s"
          }`,
          detail: "A container image has unresolved vulnerabilities (ECR scan).",
        });
      }
    }
  }

  // Stabilize the array identity while the findings are unchanged, so the sentinel's
  // reconcile only re-runs when something actually changed.
  const sig = out.map((o) => `${o.id}:${o.severity}:${o.title}`).join("|");
  const memo = useRef<{ sig: string; val: DetectedObservation[] }>({ sig: "", val: [] });
  return useMemo(() => {
    if (memo.current.sig !== sig) memo.current = { sig, val: out };
    return memo.current.val;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}
