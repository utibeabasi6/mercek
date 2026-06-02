import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChannel, invoke } from "@/lib/tauri";
import { qk } from "@/lib/query-keys";
import { tabId, useShell, type Tab } from "@/app/shell";
import { appErrorMessage } from "@/lib/errors";
import type {
  AgentIntent,
  AgentSessionUpdate,
  AppError,
  NavigateIntent,
  ProposedAction,
} from "@/types";

/// Connectable harnesses with best-effort PATH detection (agent-panel spec §7).
/// Refetched when the picker opens so a freshly-installed harness shows up.
export function useAgents(enabled = true) {
  return useQuery({
    queryKey: qk.agents(),
    queryFn: () => invoke("agent_list"),
    staleTime: 10_000,
    enabled,
  });
}

// Resolve a navigate intent (§6) into a Tab. Cluster + service are fully handled;
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
  return null;
}

const errText = (e: unknown) => appErrorMessage(e as AppError);

// Drives one agent connection: connect/prompt/cancel, accumulates streamed
// updates, and routes UI intents — navigate opens a tab, propose surfaces a
// ProposedAction for the panel to confirm. The conversation bypasses TanStack
// Query and feeds component state via channels (mercek.md §12.1).
export function useAgentSession() {
  const { openTab } = useShell();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updates, setUpdates] = useState<AgentSessionUpdate[]>([]);
  const [proposal, setProposal] = useState<ProposedAction | null>(null);

  const connect = useCallback(async (agentId: string) => {
    setError(null);
    try {
      await invoke("agent_connect", { agentId });
      setConnected(true);
      return true;
    } catch (e) {
      setError(errText(e));
      setConnected(false);
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    await invoke("agent_disconnect").catch(() => {});
    setConnected(false);
    setUpdates([]);
    setProposal(null);
    setError(null);
  }, []);

  const onIntent = useCallback(
    (i: AgentIntent) => {
      if (i.type === "navigate") {
        const t = tabFromNavigate(i.intent);
        if (t) openTab(t);
      } else if (i.type === "propose") {
        setProposal(i.action);
      }
    },
    [openTab],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      setUpdates((u) => [...u, { type: "messageChunk", text: `▸ ${trimmed}\n` }]);
      const updateChan = createChannel<AgentSessionUpdate>((m) => setUpdates((u) => [...u, m]));
      const intentChan = createChannel<AgentIntent>(onIntent);
      try {
        await invoke("agent_prompt", { text: trimmed, updates: updateChan, intents: intentChan });
      } catch (e) {
        setError(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, onIntent],
  );

  const cancel = useCallback(async () => {
    await invoke("agent_cancel").catch(() => {});
  }, []);

  return {
    connected,
    busy,
    error,
    updates,
    proposal,
    clearProposal: () => setProposal(null),
    connect,
    disconnect,
    cancel,
    send,
  };
}
