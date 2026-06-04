import { Box, Boxes, Container, LayoutDashboard, Sparkles, X } from "lucide-react";
import { useShell, type TabKind } from "@/app/shell";
import { IconButton } from "@/components/ui/IconButton";

const KIND_ICON: Record<TabKind, typeof Box> = {
  cluster: Boxes,
  service: Box,
  task: Container,
};

export function TabBar() {
  const { tabs, activeTabId, focusTab, closeTab, agentFlash, goHome } = useShell();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-bg">
      <button
        type="button"
        onClick={goHome}
        title="Overview"
        className={`flex shrink-0 items-center gap-2 border-r border-border px-3 ${
          activeTabId === null ? "bg-bg-elev text-fg" : "text-fg-muted hover:text-fg-dim"
        }`}
      >
        <LayoutDashboard size={14} className="shrink-0" />
        <span className="text-[12px]">Overview</span>
      </button>
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const KindIcon = KIND_ICON[tab.kind];
        return (
          <div
            key={tab.id}
            className={`group relative flex min-w-0 items-center gap-2 border-r border-border px-3 ${
              active ? "bg-bg-elev text-fg" : "text-fg-muted hover:text-fg-dim"
            }`}
          >
            {agentFlash?.tabId === tab.id && (
              <span
                key={agentFlash.seq}
                aria-hidden
                className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-accent"
                style={{ animation: "mercek-agent-flash 2.2s ease-out forwards" }}
              >
                <Sparkles size={11} className="absolute right-1 top-1 text-accent" />
              </span>
            )}
            <button
              type="button"
              onClick={() => focusTab(tab.id)}
              title={tab.sublabel ? `${tab.label} · ${tab.sublabel}` : tab.label}
              className="flex min-w-0 items-center gap-2"
            >
              <KindIcon size={14} className="shrink-0 text-fg-muted" />
              <span className="truncate">{tab.label}</span>
              {tab.sublabel && (
                <span className="truncate text-[11px] text-fg-muted">{tab.sublabel}</span>
              )}
            </button>
            <IconButton
              size="sm"
              onClick={() => closeTab(tab.id)}
              className="opacity-0 group-hover:opacity-100"
              aria-label="close tab"
            >
              <X />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
