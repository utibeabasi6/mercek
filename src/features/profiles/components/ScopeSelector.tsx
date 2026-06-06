import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useProfiles, useScopes, useSetScopes } from "@/features/profiles/api";
import { StatusGlyph } from "@/components/ui/Badge";
import { toneFor } from "@/lib/status";
import type { AwsProfile, Scope } from "@/types";

// Regions a profile can be activated in. A profile may be active in several at once —
// each (profile, region) is its own scope downstream (tree, Overview, compare, metrics).
const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "ca-central-1", "ca-west-1", "sa-east-1",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2",
  "eu-north-1", "eu-south-1", "eu-south-2",
  "ap-south-1", "ap-south-2", "ap-southeast-1", "ap-southeast-2", "ap-southeast-3",
  "ap-southeast-4", "ap-northeast-1", "ap-northeast-2", "ap-northeast-3", "ap-east-1",
  "me-south-1", "me-central-1", "af-south-1", "il-central-1",
  "us-gov-east-1", "us-gov-west-1", "cn-north-1", "cn-northwest-1",
];

export function ScopeSelector() {
  const { data: profiles } = useProfiles();
  const { data: scopes } = useScopes();
  const setScopes = useSetScopes();
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const current = scopes ?? [];
  const regionsOf = (name: string) =>
    current.filter((s) => s.profile === name).map((s) => s.region);

  // Click the profile row: quick-toggle it on (at its default region) or fully off.
  const toggleProfile = (p: AwsProfile) => {
    if (p.status === "needs_reauth") return;
    const region = p.regionDefault ?? "us-east-1";
    const next: Scope[] =
      regionsOf(p.name).length > 0
        ? current.filter((s) => s.profile !== p.name)
        : [...current, { profile: p.name, region }];
    setScopes.mutate(next);
  };

  // Region menu: add/remove a single (profile, region) scope.
  const toggleRegion = (name: string, region: string) => {
    const on = current.some((s) => s.profile === name && s.region === region);
    const next: Scope[] = on
      ? current.filter((s) => !(s.profile === name && s.region === region))
      : [...current, { profile: name, region }];
    setScopes.mutate(next);
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-fg-muted">
        <span>scope</span>
        <span className="tabular-nums">{current.length} active</span>
      </div>
      <div className="pb-1">
        {(profiles ?? []).map((p) => {
          const regions = regionsOf(p.name);
          const isActive = regions.length > 0;
          const reauth = p.status === "needs_reauth";
          const label =
            regions.length === 0
              ? (p.regionDefault ?? "—")
              : regions.length === 1
                ? regions[0]
                : `${regions[0]} +${regions.length - 1}`;
          return (
            <div key={p.name} className="relative">
              <div
                className={`flex w-full items-center gap-2 px-3 py-1.5 hover:bg-bg-elev ${
                  isActive ? "text-fg" : "text-fg-dim"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleProfile(p)}
                  disabled={reauth}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span
                    className={`flex size-3 shrink-0 items-center justify-center rounded-[3px] border text-[9px] ${
                      isActive ? "border-accent bg-accent text-bg" : "border-border-strong"
                    }`}
                  >
                    {isActive ? "✓" : ""}
                  </span>
                  <StatusGlyph tone={reauth ? "err" : toneFor(p.status)} />
                  <span className="truncate" title={p.name}>
                    {p.name}
                  </span>
                </button>
                {reauth ? (
                  <span className="shrink-0 text-[11px] text-fg-muted">reauth</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMenuFor((m) => (m === p.name ? null : p.name))}
                    title="choose regions"
                    className="flex shrink-0 items-center gap-1 rounded px-1 text-[11px] text-fg-muted hover:text-fg"
                  >
                    <span className="max-w-[110px] truncate">{label}</span>
                    <ChevronDown size={11} className="shrink-0" />
                  </button>
                )}
              </div>
              {menuFor === p.name && (
                <RegionMenu
                  active={new Set(regions)}
                  defaultRegion={p.regionDefault ?? undefined}
                  onToggle={(r) => toggleRegion(p.name, r)}
                  onClose={() => setMenuFor(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RegionMenu({
  active,
  defaultRegion,
  onToggle,
  onClose,
}: {
  active: Set<string>;
  defaultRegion?: string;
  onToggle: (region: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // The profile's default region first, then the rest.
  const ordered = defaultRegion
    ? [defaultRegion, ...AWS_REGIONS.filter((r) => r !== defaultRegion)]
    : AWS_REGIONS;

  return (
    <div
      ref={ref}
      className="absolute right-2 top-full z-50 max-h-64 w-44 overflow-auto rounded border border-border-strong bg-bg-elev py-1 shadow-2xl"
    >
      {ordered.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onToggle(r)}
          className="flex w-full items-center gap-2 px-2 py-1 text-left text-[12px] hover:bg-bg-elev-2"
        >
          <span
            className={`flex size-3 shrink-0 items-center justify-center rounded-[3px] border text-[9px] ${
              active.has(r) ? "border-accent bg-accent text-bg" : "border-border-strong"
            }`}
          >
            {active.has(r) ? "✓" : ""}
          </span>
          <span className={`font-mono ${active.has(r) ? "text-fg" : "text-fg-dim"}`}>{r}</span>
          {r === defaultRegion && (
            <span className="ml-auto text-[10px] text-fg-muted">default</span>
          )}
        </button>
      ))}
    </div>
  );
}
