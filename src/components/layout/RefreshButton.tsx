import { useQueryClient } from "@tanstack/react-query";
import { useGraphs } from "@/features/discovery/api";
import { qk } from "@/lib/query-keys";
import { Spinner } from "@/components/ui/Spinner";

export function RefreshButton() {
  const qc = useQueryClient();
  const { isFetching } = useGraphs();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.snapshots() });
    void qc.invalidateQueries({ queryKey: qk.discovery.activated() });
    void qc.invalidateQueries({ queryKey: ["clusterResources"] });
  };

  return (
    <button
      type="button"
      onClick={refresh}
      title="refresh"
      aria-label="refresh"
      className="group flex size-8 items-center justify-center rounded text-fg-muted hover:bg-bg-elev hover:text-fg"
    >
      {isFetching ? (
        <Spinner className="size-5" />
      ) : (
        <span className="inline-block text-[20px] leading-none transition-transform duration-300 group-hover:rotate-180">
          ⟳
        </span>
      )}
    </button>
  );
}
