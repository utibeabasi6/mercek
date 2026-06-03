import { Section } from "@/components/ui/Tabs";
import { Spinner } from "@/components/ui/Spinner";
import { useTaskDefinition } from "@/features/discovery/api";
import { useImageScan } from "@/features/images/api";
import { parseEcrImage, type EcrRef } from "@/features/images/parse";
import type { ImageScan, Scope } from "@/types";

const SEVS = [
  { key: "critical", label: "C", cls: "bg-err/20 text-err" },
  { key: "high", label: "H", cls: "bg-warn/20 text-warn" },
  { key: "medium", label: "M", cls: "bg-warn/10 text-fg-dim" },
  { key: "low", label: "L", cls: "bg-bg-elev-2 text-fg-muted" },
] as const;

function Counts({ scan }: { scan: ImageScan }) {
  const total = scan.critical + scan.high + scan.medium + scan.low;
  if ((scan.scanStatus ?? "") !== "COMPLETE") {
    return <span className="text-[11px] text-fg-muted">{scan.scanStatus ?? "not scanned"}</span>;
  }
  if (total === 0) return <span className="text-[11px] text-ok">no findings</span>;
  return (
    <span className="flex items-center gap-1">
      {SEVS.map((s) => {
        const n = scan[s.key];
        return n > 0 ? (
          <span key={s.key} className={`rounded px-1 text-[10px] tabular-nums ${s.cls}`}>
            {n}
            {s.label}
          </span>
        ) : null;
      })}
    </span>
  );
}

function ImageScanRow({ scope, ecr }: { scope: Scope; ecr: EcrRef }) {
  const { data, isLoading, isError } = useImageScan(scope, ecr.repository, ecr.reference);
  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[12px] first:border-t-0">
      <span className="min-w-0 flex-1 truncate font-mono text-fg-dim" title={`${ecr.repository}:${ecr.reference}`}>
        {ecr.repository}
        <span className="text-fg-muted">:{ecr.reference}</span>
      </span>
      {isLoading ? (
        <Spinner className="size-3.5" />
      ) : isError || !data ? (
        <span className="text-[11px] text-fg-muted">no scan</span>
      ) : (
        <Counts scan={data} />
      )}
    </div>
  );
}

// ECR vuln-scan summaries for a service's container images. Hidden when none of the
// images are ECR-hosted (we only scan ECR).
export function ImageScansSection({ scope, taskDefArn }: { scope: Scope; taskDefArn: string }) {
  const { data: td } = useTaskDefinition(scope, taskDefArn);
  const refs = new Map<string, EcrRef>();
  for (const c of td?.containerDefs ?? []) {
    const r = parseEcrImage(c.image);
    if (r) refs.set(`${r.repository}:${r.reference}`, r);
  }
  if (refs.size === 0) return null;

  return (
    <Section title="image security">
      <div className="max-w-2xl overflow-hidden rounded border border-border">
        {[...refs.values()].map((ecr) => (
          <ImageScanRow key={`${ecr.repository}:${ecr.reference}`} scope={scope} ecr={ecr} />
        ))}
      </div>
    </Section>
  );
}
