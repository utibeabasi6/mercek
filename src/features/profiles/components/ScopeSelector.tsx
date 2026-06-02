import { useProfiles, useScopes, useSetScopes } from "@/features/profiles/api";
import { StatusGlyph } from "@/components/ui/Badge";
import { toneFor } from "@/lib/status";
import type { AwsProfile } from "@/types";

export function ScopeSelector() {
  const { data: profiles } = useProfiles();
  const { data: scopes } = useScopes();
  const setScopes = useSetScopes();

  const active = new Set((scopes ?? []).map((s) => s.profile));

  const toggle = (p: AwsProfile) => {
    if (p.status === "needs_reauth") return;
    const region = p.regionDefault ?? "us-east-1";
    const current = scopes ?? [];
    const next = active.has(p.name)
      ? current.filter((s) => s.profile !== p.name)
      : [...current, { profile: p.name, region }];
    setScopes.mutate(next);
  };

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-fg-muted">
        <span>scope</span>
        <span className="tabular-nums">{active.size} active</span>
      </div>
      <div className="pb-1">
        {(profiles ?? []).map((p) => {
          const isActive = active.has(p.name);
          const reauth = p.status === "needs_reauth";
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => toggle(p)}
              disabled={reauth}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-elev disabled:cursor-not-allowed disabled:opacity-60 ${
                isActive ? "text-fg" : "text-fg-dim"
              }`}
            >
              <span
                className={`flex size-3 items-center justify-center rounded-[3px] border text-[9px] ${
                  isActive ? "border-accent bg-accent text-bg" : "border-border-strong"
                }`}
              >
                {isActive ? "✓" : ""}
              </span>
              <StatusGlyph tone={reauth ? "err" : toneFor(p.status)} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto truncate text-[11px] text-fg-muted">
                {reauth ? "reauth" : (p.regionDefault ?? "—")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
