import { useGraphs } from "@/features/discovery/api";
import { useProfiles } from "@/features/profiles/api";
import { appErrorMessage } from "@/lib/errors";

export function DiscoveryBanner() {
  const { errors, stale } = useGraphs();
  const { data: profiles } = useProfiles();
  if (errors.length === 0) return null;

  const kindOf = (name: string) => profiles?.find((p) => p.name === name)?.kind;

  return (
    <div className="flex flex-col gap-1 border-b border-border bg-bg-elev px-4 py-2 text-[12px]">
      {errors.map(({ scope, error }) => {
        const message = appErrorMessage(error, kindOf(scope.profile));
        return (
          <div key={`${scope.profile}:${scope.region}`} className="flex items-center gap-2">
            <span className="text-err">●</span>
            <span className="shrink-0 text-fg-dim">
              {scope.profile}/{scope.region}
            </span>
            <span className="min-w-0 truncate text-fg" title={message}>
              {message}
            </span>
            {stale && <span className="ml-auto shrink-0 text-[11px] text-warn">showing cached</span>}
          </div>
        );
      })}
    </div>
  );
}
