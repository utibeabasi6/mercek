import { useShell, type TabKind } from "@/app/shell";

const KIND_GLYPH: Record<TabKind, string> = {
  cluster: "▣",
  service: "◈",
  task: "▸",
};

export function TabBar() {
  const { tabs, activeTabId, focusTab, closeTab } = useShell();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-bg">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className={`group flex min-w-0 items-center gap-2 border-r border-border px-3 ${
              active ? "bg-bg-elev text-fg" : "text-fg-muted hover:text-fg-dim"
            }`}
          >
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
            <button
              type="button"
              onClick={() => closeTab(tab.id)}
              className="flex size-5 items-center justify-center rounded text-[15px] leading-none text-fg-muted opacity-0 hover:bg-bg-elev-2 hover:text-fg group-hover:opacity-100"
              aria-label="close tab"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
