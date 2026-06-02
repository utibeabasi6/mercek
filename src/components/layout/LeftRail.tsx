import { ScopeSelector } from "@/features/profiles/components/ScopeSelector";
import { ResourceTree } from "@/features/discovery/components/ResourceTree";

export function LeftRail({ width }: { width: number }) {
  return (
    <div className="flex shrink-0 flex-col bg-bg" style={{ width }}>
      <ScopeSelector />
      <div className="min-h-0 flex-1 overflow-auto">
        <ResourceTree />
      </div>
    </div>
  );
}
