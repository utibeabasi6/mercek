import { useEffect, useState } from "react";
import { useShell } from "@/app/shell";
import { useGraphs } from "@/features/discovery/api";
import { shortAccount } from "@/lib/arn";
import { freshness, pluralize } from "@/lib/format";

export function StatusBar() {
  const { activeTab } = useShell();
  const { graphs, isFetching, fromCache, stale } = useGraphs();
  const cached = fromCache || stale;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const focusScope = activeTab?.scope ?? graphs[0]?.scope ?? null;
  const focusGraph =
    graphs.find(
      (g) =>
        focusScope &&
        g.scope.profile === focusScope.profile &&
        g.scope.region === focusScope.region,
    ) ?? null;

  const clusterCount = graphs.reduce((n, g) => n + g.clusters.length, 0);

  return (
    <div className="flex h-6 items-center gap-3 border-t border-border bg-bg px-3 text-[11px] text-fg-muted">
      {focusScope ? (
        <>
          <span className="text-fg-dim">{shortAccount(focusGraph?.accountId)}</span>
          <span>{focusScope.region}</span>
          <Sep />
          <span>{pluralize(clusterCount, "cluster")}</span>
          <Sep />
          <span className={isFetching ? "text-info" : cached ? "text-warn" : undefined}>
            ⟳{" "}
            {isFetching
              ? "refreshing"
              : cached
                ? "cached"
                : `${freshness(focusGraph?.fetchedAt, now)} ago`}
          </span>
        </>
      ) : (
        <span>no scope active</span>
      )}
      <span className="ml-auto flex items-center gap-1">
        throttle <span className="text-fg-dim">○</span>
      </span>
    </div>
  );
}

function Sep() {
  return <span className="text-border-strong">·</span>;
}
