import { useProfiles } from "@/features/profiles/api";

export function ReauthBanner() {
  const { data: profiles } = useProfiles();
  const stale = (profiles ?? []).filter((p) => p.status === "needs_reauth");
  if (stale.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-b border-border bg-bg-elev px-4 py-2 text-[12px]">
      {stale.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="text-warn">⟳</span>
          <span className="text-fg-dim">
            Credentials for <span className="text-fg">{p.name}</span> expired.
          </span>
          <code className="rounded bg-bg-elev-2 px-1.5 py-0.5 text-fg">
            aws sso login --profile {p.name}
          </code>
        </div>
      ))}
    </div>
  );
}
