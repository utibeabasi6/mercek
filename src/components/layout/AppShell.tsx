import { useCallback, useEffect, useMemo, useState } from "react";
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
import { RefreshButton } from "@/components/layout/RefreshButton";
import { IconButton } from "@/components/ui/IconButton";
import { SettingsDialog } from "@/features/settings/SettingsDialog";

function Titlebar({
  onSearch,
  agentOpen,
  onToggleAgent,
  onSettings,
}: {
  onSearch: () => void;
  agentOpen: boolean;
  onToggleAgent: () => void;
  onSettings: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <div className="flex h-10 items-center gap-2 border-b border-border bg-bg px-3">
      <span className="text-fg-dim">◎ mercek</span>
      <button
        type="button"
        onClick={onSearch}
        className="mx-auto w-full max-w-md rounded border border-border bg-bg-elev px-3 py-1 text-left text-fg-muted hover:border-border-strong"
      >
        search resources… <span className="float-right">{modLabel} P</span>
      </button>
      <RefreshButton />
      <IconButton
        onClick={toggleTheme}
        className="group"
        title={`switch to ${theme === "dark" ? "light" : "dark"} theme`}
      >
        <span className="group-hover:hidden">{theme === "dark" ? "☾" : "☀"}</span>
        <span className="hidden group-hover:inline">{theme === "dark" ? "☀" : "☾"}</span>
      </IconButton>
      <IconButton
        onClick={onSettings}
        title="settings"
        className="duration-300 hover:rotate-90"
      >
        ⚙
      </IconButton>
      <button
        type="button"
        onClick={onToggleAgent}
        title={`${agentOpen ? "hide" : "show"} agent panel · ${modLabel} J`}
        className={`rounded border px-2 py-0.5 ${
          agentOpen
            ? "border-accent text-accent"
            : "border-border text-fg-dim hover:border-border-strong hover:text-fg"
        }`}
      >
        ◇ agent {modLabel} J
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
    agentOpen,
    toggleAgent,
  } = useShell();
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  const [railWidth, setRailWidth] = useState(() => {
    const stored = Number(localStorage.getItem("mercek.railWidth"));
    return stored >= 180 && stored <= 640 ? stored : 256;
  });
  useEffect(() => {
    localStorage.setItem("mercek.railWidth", String(railWidth));
  }, [railWidth]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentWidth, setAgentWidth] = useState(() => {
    const stored = Number(localStorage.getItem("mercek.rightPanelWidth"));
    return stored >= 280 && stored <= 720 ? stored : 380;
  });
  useEffect(() => {
    localStorage.setItem("mercek.rightPanelWidth", String(agentWidth));
  }, [agentWidth]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => setRailWidth(Math.min(640, Math.max(180, ev.clientX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  // The right panel resizes from its left edge: width grows as the cursor moves left.
  const startResizeAgent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) =>
      setAgentWidth(Math.min(720, Math.max(280, window.innerWidth - ev.clientX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

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
        id: "toggle-agent",
        title: agentOpen ? "Hide agent panel" : "Show agent panel",
        hint: `${modLabel} J`,
        run: toggleAgent,
      },
      {
        id: "toggle-theme",
        title: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
        run: toggleTheme,
      },
    ],
    [
      openPalette,
      toggleDrawer,
      drawerOpen,
      refresh,
      closeActiveTab,
      agentOpen,
      toggleAgent,
      theme,
      toggleTheme,
    ],
  );

  const keymap = useMemo<KeyMap>(() => {
    const map: KeyMap = {
      "mod+k": () => openPalette("command"),
      "mod+p": () => openPalette("resource"),
      "mod+b": toggleDrawer,
      "mod+w": closeActiveTab,
      "mod+r": refresh,
      "mod+j": toggleAgent,
    };
    for (let i = 1; i <= 9; i++) {
      map[`mod+${i}`] = () => focusTabIndex(i - 1);
    }
    return map;
  }, [openPalette, toggleDrawer, closeActiveTab, refresh, toggleAgent, focusTabIndex]);

  useKeybindings(keymap);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <Titlebar
        onSearch={() => openPalette("resource")}
        agentOpen={agentOpen}
        onToggleAgent={toggleAgent}
        onSettings={() => setSettingsOpen(true)}
      />
      <ReauthBanner />
      <DiscoveryBanner />
      <div className="flex min-h-0 flex-1">
        <LeftRail width={railWidth} />
        <div
          onMouseDown={startResize}
          className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
          title="drag to resize"
        />
        <Workspace />
        {agentOpen && (
          <div
            onMouseDown={startResizeAgent}
            className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
            title="drag to resize"
          />
        )}
        <RightPanel open={agentOpen} width={agentWidth} />
      </div>
      <Drawer />
      <StatusBar />
      <CommandPalette commands={commands} />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
