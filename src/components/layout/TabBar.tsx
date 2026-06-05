import { useEffect, useState } from "react";
import { Box, Boxes, Container, LayoutDashboard, Sparkles, X } from "lucide-react";
import { useShell, type TabKind } from "@/app/shell";
import { IconButton } from "@/components/ui/IconButton";

const KIND_ICON: Record<TabKind, typeof Box> = {
  cluster: Boxes,
  service: Box,
  task: Container,
};

interface MenuState {
  x: number;
  y: number;
  tabId: string;
}

export function TabBar() {
  const {
    tabs,
    activeTabId,
    focusTab,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight,
    agentFlash,
    goHome,
  } = useShell();
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Close the context menu on Escape (outside clicks are handled by a backdrop).
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  if (tabs.length === 0) return null;

  const menuIndex = menu ? tabs.findIndex((t) => t.id === menu.tabId) : -1;

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
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
            }}
            onAuxClick={(e) => {
              // Middle-click closes the tab, like a browser.
              if (e.button === 1) {
                e.preventDefault();
                closeTab(tab.id);
              }
            }}
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

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setMenu(null)} />
          <div
            className="fixed z-50 min-w-[176px] rounded border border-border-strong bg-bg-elev py-1 text-[12px] shadow-lg"
            style={{ top: menu.y, left: Math.min(menu.x, window.innerWidth - 184) }}
          >
            <MenuItem
              label="Close"
              onClick={() => {
                closeTab(menu.tabId);
                setMenu(null);
              }}
            />
            <MenuItem
              label="Close Others"
              disabled={tabs.length <= 1}
              onClick={() => {
                closeOtherTabs(menu.tabId);
                setMenu(null);
              }}
            />
            <MenuItem
              label="Close to the Right"
              disabled={menuIndex < 0 || menuIndex >= tabs.length - 1}
              onClick={() => {
                closeTabsToRight(menu.tabId);
                setMenu(null);
              }}
            />
            <div className="my-1 h-px bg-border" />
            <MenuItem
              label="Close All"
              onClick={() => {
                closeAllTabs();
                setMenu(null);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-fg-dim hover:bg-bg-elev-2 hover:text-fg disabled:cursor-not-allowed disabled:text-fg-muted disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}
