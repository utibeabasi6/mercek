import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShell } from "@/app/shell";
import { useTheme } from "@/app/providers";
import { useKeybindings, modLabel, type KeyMap } from "@/app/keybindings";
import { qk } from "@/lib/query-keys";
import { LeftRail } from "@/components/layout/LeftRail";
import { Workspace } from "@/components/layout/Workspace";
import { RightPanel } from "@/components/layout/RightPanel";
import { Drawer } from "@/components/layout/Drawer";
import { StatusBar } from "@/components/layout/StatusBar";
import { CommandPalette, type PaletteCommand } from "@/components/ui/CommandPalette";
import { ReauthBanner } from "@/features/profiles/components/ReauthBanner";
import { DiscoveryBanner } from "@/features/discovery/components/DiscoveryBanner";

function Titlebar({ onSearch }: { onSearch: () => void }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex h-9 items-center gap-3 border-b border-border bg-bg px-3">
      <span className="text-fg-dim">◎ mercek</span>
      <button
        type="button"
        onClick={onSearch}
        className="mx-auto w-full max-w-md rounded border border-border bg-bg-elev px-3 py-1 text-left text-fg-muted hover:border-border-strong"
      >
        search resources… <span className="float-right">{modLabel} P</span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="text-fg-muted hover:text-fg"
        title="toggle theme"
      >
        {theme === "dark" ? "☾" : "☀"}
      </button>
      <button
        type="button"
        disabled
        title="agent panel lands in Phase 5"
        className="cursor-not-allowed rounded border border-border px-2 py-0.5 text-fg-muted opacity-60"
      >
        agent {modLabel}
      </button>
    </div>
  );
}

export function AppShell() {
  const {
    openPalette,
    toggleDrawer,
    closeActiveTab,
    focusTabIndex,
    drawerOpen,
  } = useShell();
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.discovery.activated() });
  }, [qc]);

  const commands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "go-resource",
        title: "Go to resource…",
        hint: `${modLabel} P`,
        run: () => setTimeout(() => openPalette("resource"), 0),
      },
      {
        id: "toggle-drawer",
        title: drawerOpen ? "Close drawer" : "Open drawer",
        hint: `${modLabel} B`,
        run: toggleDrawer,
      },
      { id: "refresh", title: "Refresh discovery", hint: `${modLabel} R`, run: refresh },
      { id: "close-tab", title: "Close active tab", hint: `${modLabel} W`, run: closeActiveTab },
      {
        id: "toggle-theme",
        title: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
        run: toggleTheme,
      },
    ],
    [openPalette, toggleDrawer, drawerOpen, refresh, closeActiveTab, theme, toggleTheme],
  );

  const keymap = useMemo<KeyMap>(() => {
    const map: KeyMap = {
      "mod+k": () => openPalette("command"),
      "mod+p": () => openPalette("resource"),
      "mod+b": toggleDrawer,
      "mod+w": closeActiveTab,
      "mod+r": refresh,
    };
    for (let i = 1; i <= 9; i++) {
      map[`mod+${i}`] = () => focusTabIndex(i - 1);
    }
    return map;
  }, [openPalette, toggleDrawer, closeActiveTab, refresh, focusTabIndex]);

  useKeybindings(keymap);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <Titlebar onSearch={() => openPalette("resource")} />
      <ReauthBanner />
      <DiscoveryBanner />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <Workspace />
        <RightPanel />
      </div>
      <Drawer />
      <StatusBar />
      <CommandPalette commands={commands} />
    </div>
  );
}
