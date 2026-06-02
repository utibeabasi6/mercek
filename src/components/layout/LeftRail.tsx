import { ScopeSelector } from "@/features/profiles/components/ScopeSelector";
import { ResourceTree } from "@/features/discovery/components/ResourceTree";

export function LeftRail() {
  return (
    <div className="flex w-64 shrink-0 flex-col border-r border-border bg-bg">
      <ScopeSelector />
      <div className="min-h-0 flex-1 overflow-auto">
        <ResourceTree />
      </div>
    </div>
  );
}
