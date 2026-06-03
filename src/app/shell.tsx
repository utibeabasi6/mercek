import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Scope } from "@/types";

export type TabKind = "cluster" | "service" | "task";

export interface Tab {
  id: string;
  kind: TabKind;
  scope: Scope;
  label: string;
  sublabel?: string;
  clusterName?: string;
  serviceName?: string;
  taskArn?: string;
  // Deep-link targets. Not part of `id`, so re-opening a
  // tab at a different section focuses the existing tab instead of duplicating.
  section?: string;
  focusId?: string;
}

export type PaletteMode = "command" | "resource";

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
}

type TabsAction =
  | { type: "open"; tab: Tab }
  | { type: "close"; id: string }
  | { type: "focus"; id: string };

function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case "open": {
      const exists = state.tabs.some((t) => t.id === action.tab.id);
      // Re-opening an existing tab re-points its deep-link target so an
      // agent "navigate" can move you to a different section of an open tab.
      return {
        tabs: exists
          ? state.tabs.map((t) =>
              t.id === action.tab.id
                ? { ...t, section: action.tab.section, focusId: action.tab.focusId }
                : t,
            )
          : [...state.tabs, action.tab],
        activeTabId: action.tab.id,
      };
    }
    case "close": {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      let activeTabId = state.activeTabId;
      if (state.activeTabId === action.id) {
        const next = tabs[idx] ?? tabs[idx - 1] ?? null;
        activeTabId = next?.id ?? null;
      }
      return { tabs, activeTabId };
    }
    case "focus":
      return state.tabs.some((t) => t.id === action.id)
        ? { ...state, activeTabId: action.id }
        : state;
    default:
      return state;
  }
}

interface ShellCtx {
  tabs: Tab[];
  activeTabId: string | null;
  activeTab: Tab | null;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  focusTab: (id: string) => void;
  focusTabIndex: (index: number) => void;
  closeActiveTab: () => void;

  drawerOpen: boolean;
  toggleDrawer: () => void;
  openDrawer: () => void;

  agentOpen: boolean;
  toggleAgent: () => void;
  // A message queued for the agent (e.g. from an Investigate button); the panel
  // sends it once connected. Opens the panel.
  agentRequest: string | null;
  askAgent: (message: string) => void;
  clearAgentRequest: () => void;

  paletteOpen: boolean;
  paletteMode: PaletteMode;
  openPalette: (mode: PaletteMode) => void;
  closePalette: () => void;

  // The tab the agent most recently navigated to, flashed briefly so the user sees
  // where it went. `seq` re-triggers the animation on repeat navigations.
  agentFlash: { tabId: string; seq: number } | null;
  flashAgentTab: (tabId: string) => void;
}

const ShellContext = createContext<ShellCtx | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [{ tabs, activeTabId }, dispatch] = useReducer(tabsReducer, {
    tabs: [],
    activeTabId: null,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentRequest, setAgentRequest] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("command");
  const [agentFlash, setAgentFlash] = useState<{ tabId: string; seq: number } | null>(null);
  const flashSeq = useRef(0);

  // Flash a tab as agent-driven; auto-clears unless another flash superseded it.
  const flashAgentTab = useCallback((tabId: string) => {
    const seq = (flashSeq.current += 1);
    setAgentFlash({ tabId, seq });
    setTimeout(() => setAgentFlash((cur) => (cur?.seq === seq ? null : cur)), 2500);
  }, []);

  const openTab = useCallback((tab: Tab) => dispatch({ type: "open", tab }), []);
  const closeTab = useCallback((id: string) => dispatch({ type: "close", id }), []);
  const focusTab = useCallback((id: string) => dispatch({ type: "focus", id }), []);

  const focusTabIndex = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) dispatch({ type: "focus", id: tab.id });
    },
    [tabs],
  );

  const closeActiveTab = useCallback(() => {
    if (activeTabId) dispatch({ type: "close", id: activeTabId });
  }, [activeTabId]);

  const openPalette = useCallback((mode: PaletteMode) => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((v) => !v), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const toggleAgent = useCallback(() => setAgentOpen((v) => !v), []);
  const askAgent = useCallback((message: string) => {
    setAgentRequest(message);
    setAgentOpen(true);
  }, []);
  const clearAgentRequest = useCallback(() => setAgentRequest(null), []);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );

  const value = useMemo<ShellCtx>(
    () => ({
      tabs,
      activeTabId,
      activeTab,
      openTab,
      closeTab,
      focusTab,
      focusTabIndex,
      closeActiveTab,
      drawerOpen,
      toggleDrawer,
      openDrawer,
      agentOpen,
      toggleAgent,
      agentRequest,
      askAgent,
      clearAgentRequest,
      paletteOpen,
      paletteMode,
      openPalette,
      closePalette,
      agentFlash,
      flashAgentTab,
    }),
    [
      tabs,
      activeTabId,
      activeTab,
      openTab,
      closeTab,
      focusTab,
      focusTabIndex,
      closeActiveTab,
      drawerOpen,
      toggleDrawer,
      openDrawer,
      agentOpen,
      toggleAgent,
      agentRequest,
      askAgent,
      clearAgentRequest,
      paletteOpen,
      paletteMode,
      openPalette,
      closePalette,
      agentFlash,
      flashAgentTab,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellCtx {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within <ShellProvider>");
  return ctx;
}

export function tabId(kind: TabKind, scope: Scope, key: string): string {
  return `${kind}:${scope.profile}:${scope.region}:${key}`;
}
