import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChannel, invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { tabId, useShell, type Tab } from "@/app/shell";
import { appErrorMessage } from "@/lib/errors";
import { arnName } from "@/lib/arn";
import {
  deleteThread as removeStoredThread,
  loadThreadItems,
  loadThreadList,
  newThreadId,
  saveThread,
  titleFromItems,
} from "@/lib/agentHistory";
import type { ThreadItem, ThreadMeta } from "@/features/agent/thread";

export type { ThreadItem, ThreadMeta } from "@/features/agent/thread";
import type {
  AgentIntent,
  AgentMode,
  AgentSessionUpdate,
  AppError,
  NavigateIntent,
  ProposedAction,
} from "@/types";

/// Connectable harnesses with best-effort PATH detection.
/// Refetched when the picker opens so a freshly-installed harness shows up.
export function useAgents(enabled = true) {
  return useQuery({
    queryKey: qk.agents(),
    queryFn: () => invoke("agent_list"),
    staleTime: 10_000,
    enabled,
  });
}

// Resolve a navigate intent into a Tab. Cluster + service are fully handled;
// task navigation needs the owning cluster (not in the intent yet) so it's skipped.
function tabFromNavigate(n: NavigateIntent): Tab | null {
  const link = { section: n.section ?? undefined, focusId: n.focusId ?? undefined };
  if (n.target === "cluster") {
    return {
      id: tabId("cluster", n.scope, n.key),
      kind: "cluster",
      scope: n.scope,
      label: n.key,
      sublabel: n.scope.profile,
      clusterName: n.key,
      ...link,
    };
  }
  if (n.target === "service") {
    const slash = n.key.indexOf("/");
    if (slash <= 0) return null;
    const cluster = n.key.slice(0, slash);
    const name = n.key.slice(slash + 1);
    return {
      id: tabId("service", n.scope, n.key),
      kind: "service",
      scope: n.scope,
      label: name,
      sublabel: cluster,
      clusterName: cluster,
      serviceName: name,
      ...link,
    };
  }
  if (n.target === "task") {
    // `key` is the task ARN: arn:…:task/<cluster>/<taskId> — the cluster is in it.
    const cluster = /:task\/([^/]+)\//.exec(n.key)?.[1];
    if (!cluster) return null;
    return {
      id: tabId("task", n.scope, n.key),
      kind: "task",
      scope: n.scope,
      label: arnName(n.key).slice(0, 12),
      sublabel: cluster,
      clusterName: cluster,
      taskArn: n.key,
      ...link,
    };
  }
  return null;
}

const errText = (e: unknown) => appErrorMessage(e as AppError);

// What the user is currently looking at, fed to the agent so it can resolve
// "this service" / "prod" without guessing.
function viewContext(tab: Tab | null): string | undefined {
  if (!tab) return undefined;
  const { scope, kind, clusterName, serviceName, taskArn, section } = tab;
  const where =
    kind === "service"
      ? `service \`${serviceName}\` in cluster \`${clusterName}\``
      : kind === "task"
        ? `task \`${taskArn}\` in cluster \`${clusterName}\``
        : `cluster \`${clusterName}\``;
  return `profile=${scope.profile} region=${scope.region}; viewing ${where}${
    section ? ` (${section} tab)` : ""
  }`;
}

// Drives one agent connection: connect/prompt/cancel, accumulates streamed
// updates, and routes UI intents — navigate opens a tab, propose surfaces a
// ProposedAction for the panel to confirm. The conversation bypasses TanStack
// Query and feeds component state via channels.
export function useAgentSession() {
  const { openTab, activeTab, flashAgentTab, openDrawer } = useShell();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [proposal, setProposal] = useState<ProposedAction | null>(null);
  const [modes, setModes] = useState<AgentMode[]>([]);
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>(() => newThreadId());
  const createdAtRef = useRef<number>(Date.now());
  const lastAgent = useRef<{ id: string; model?: string } | null>(null);

  // Load saved conversations once on mount.
  useEffect(() => {
    void loadThreadList().then(setThreads).catch(() => {});
  }, []);

  // Persist the active transcript to history as it grows, titled by the first ask.
  // Debounced so a turn's stream of chunks coalesces into one write, not hundreds.
  useEffect(() => {
    if (thread.length === 0) return;
    const h = setTimeout(() => {
      const meta: ThreadMeta = {
        id: activeThreadId,
        title: titleFromItems(thread),
        createdAt: createdAtRef.current,
        updatedAt: Date.now(),
      };
      void saveThread(meta, thread).then(setThreads).catch(() => {});
    }, 400);
    return () => clearTimeout(h);
  }, [thread, activeThreadId]);

  const connect = useCallback(async (agentId: string, model?: string) => {
    setError(null);
    setConnecting(true);
    lastAgent.current = { id: agentId, model };
    try {
      const info = await invoke("agent_connect", { agentId, model });
      setModes(info.modes);
      setCurrentMode(info.currentMode);
      setConnected(true);
      return true;
    } catch (e) {
      setError(errText(e));
      setConnected(false);
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  const setMode = useCallback(async (modeId: string) => {
    setCurrentMode(modeId); // optimistic
    try {
      await invoke("agent_set_mode", { modeId });
    } catch (e) {
      setError(errText(e));
    }
  }, []);

  const disconnect = useCallback(async () => {
    await invoke("agent_disconnect").catch(() => {});
    setConnected(false);
    setThread([]);
    setProposal(null);
    setError(null);
    setModes([]);
    setCurrentMode(null);
    // Fresh transcript id so reconnecting doesn't overwrite the saved one.
    createdAtRef.current = Date.now();
    setActiveThreadId(newThreadId());
  }, []);

  // Start a fresh conversation: new transcript + a fresh agent session so prior
  // context doesn't carry over (the active thread is already saved by the effect).
  const newChat = useCallback(async () => {
    setThread([]);
    setProposal(null);
    setError(null);
    createdAtRef.current = Date.now();
    setActiveThreadId(newThreadId());
    if (lastAgent.current && connected) {
      await invoke("agent_disconnect").catch(() => {});
      await connect(lastAgent.current.id, lastAgent.current.model);
    }
  }, [connect, connected]);

  // Reopen a saved transcript to view (and continue) it.
  const openThread = useCallback(
    (id: string) => {
      createdAtRef.current = threads.find((t) => t.id === id)?.createdAt ?? Date.now();
      setActiveThreadId(id);
      setProposal(null);
      void loadThreadItems(id).then(setThread).catch(() => {});
    },
    [threads],
  );

  const removeThread = useCallback(
    (id: string) => {
      void removeStoredThread(id).then(setThreads).catch(() => {});
      if (id === activeThreadId) {
        setThread([]);
        createdAtRef.current = Date.now();
        setActiveThreadId(newThreadId());
      }
    },
    [activeThreadId],
  );

  const onIntent = useCallback(
    (i: AgentIntent) => {
      if (i.type === "navigate") {
        const t = tabFromNavigate(i.intent);
        if (t) {
          openTab(t);
          flashAgentTab(t.id); // briefly highlight the tab the agent drove us to
          // Logs live in the bottom drawer (it auto-picks the latest task).
          if (i.intent.section === "logs") openDrawer();
        }
      } else if (i.type === "propose") {
        setProposal(i.action);
      }
    },
    [openTab, flashAgentTab, openDrawer],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      setThread((t) => [...t, { role: "user", text: trimmed }]);
      const updateChan = createChannel<AgentSessionUpdate>((m) =>
        setThread((t) => [...t, { role: "agent", update: m }]),
      );
      const intentChan = createChannel<AgentIntent>(onIntent);
      try {
        await invoke("agent_prompt", {
          text: trimmed,
          context: viewContext(activeTab),
          updates: updateChan,
          intents: intentChan,
        });
      } catch (e) {
        setError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, onIntent, activeTab],
  );

  const cancel = useCallback(async () => {
    await invoke("agent_cancel").catch(() => {});
  }, []);

  return {
    connected,
    connecting,
    busy,
    error,
    thread,
    proposal,
    modes,
    currentMode,
    setMode,
    clearProposal: () => setProposal(null),
    connect,
    disconnect,
    cancel,
    send,
    threads,
    activeThreadId,
    newChat,
    openThread,
    removeThread,
  };
}
