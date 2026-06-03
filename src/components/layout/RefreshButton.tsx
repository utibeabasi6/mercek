import { useQueryClient } from "@tanstack/react-query";
import { useGraphs } from "@/features/discovery/api";
import { qk } from "@/lib/query-keys";
import { Spinner } from "@/components/ui/Spinner";
import { IconButton } from "@/components/ui/IconButton";

export function RefreshButton() {
  const qc = useQueryClient();
  const { isFetching } = useGraphs();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.snapshots() });
    void qc.invalidateQueries({ queryKey: qk.discovery.activated() });
    void qc.invalidateQueries({ queryKey: ["clusterResources"] });
  };

  return (
    <IconButton onClick={refresh} title="refresh" aria-label="refresh" className="group">
      {isFetching ? (
        <Spinner className="size-5" />
      ) : (
        <span className="inline-block transition-transform duration-300 group-hover:rotate-180">
          ⟳
        </span>
      )}
    </IconButton>
  );
}
