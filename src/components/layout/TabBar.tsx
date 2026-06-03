import { useShell, type TabKind } from "@/app/shell";
import { IconButton } from "@/components/ui/IconButton";

const KIND_GLYPH: Record<TabKind, string> = {
  cluster: "▣",
  service: "◈",
  task: "▸",
};

export function TabBar() {
  const { tabs, activeTabId, focusTab, closeTab, agentFlash } = useShell();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-bg">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
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
                <span className="absolute right-1 top-0.5 text-[10px] leading-none text-accent">
                  ✨
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => focusTab(tab.id)}
              title={tab.sublabel ? `${tab.label} · ${tab.sublabel}` : tab.label}
              className="flex min-w-0 items-center gap-2"
            >
              <span className="text-fg-muted">{KIND_GLYPH[tab.kind]}</span>
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
              ✕
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
