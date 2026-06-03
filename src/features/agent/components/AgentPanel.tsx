import { useEffect, useRef, useState } from "react";
import { useShell } from "@/app/shell";
import { modLabel } from "@/app/keybindings";
import { useAgentSession, useAgents } from "@/features/agent/api";
import { getPref, PREF } from "@/lib/prefs";
import { AgentPicker } from "@/features/agent/components/AgentPicker";
import { ChatThread } from "@/features/agent/components/ChatThread";
import { ThreadMenu } from "@/features/agent/components/ThreadMenu";
import { IconButton } from "@/components/ui/IconButton";
import { Bot, Plus, X } from "lucide-react";
import { ProposalDialog } from "@/features/agent/components/ProposalDialog";
import { ErrorBanner, LoadingState } from "@/components/ui/StateView";
import type { AgentInfo } from "@/types";

// The reserved right-panel slot, lit up: pick a
// harness → connect → chat. The agent's reads, navigations, and the prefilled
// confirm dialog all surface here; it never writes to AWS itself.
export function AgentPanel() {
  const { toggleAgent, agentRequest, clearAgentRequest } = useShell();
  const session = useAgentSession();
  const { data: agents } = useAgents();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const autoTried = useRef(false);

  const pick = async (a: AgentInfo) => {
    setAgent(a);
    const model = getPref(PREF.agentModel(a.id)) ?? undefined;
    if (!(await session.connect(a.id, model))) setAgent(null);
  };
  const back = async () => {
    await session.disconnect();
    setAgent(null);
  };

  // Auto-connect the user's default agent (settings) the first time the panel opens.
  useEffect(() => {
    if (autoTried.current || session.connected || session.connecting || agent || session.error)
      return;
    const id = getPref(PREF.defaultAgent);
    const found = id && agents?.find((a) => a.id === id && a.detected);
    if (found) {
      autoTried.current = true;
      void pick(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // An Investigate button (or any askAgent caller) routes a message here.
  useEffect(() => {
    if (!agentRequest) return;
    clearAgentRequest();
    if (session.connected) session.send(agentRequest);
    else setPending(agentRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentRequest]);

  // Once a harness connects, flush a queued request (handles "no agent picked yet").
  useEffect(() => {
    if (session.connected && pending) {
      session.send(pending);
      setPending(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.connected, pending]);

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <Bot size={16} className="shrink-0 text-fg-dim" aria-label={agent?.name ?? "agent"} />
        {session.connected ? (
          <>
            <IconButton onClick={() => void session.newChat()} title="new chat" aria-label="new chat">
              <Plus />
            </IconButton>
            <ThreadMenu
              threads={session.threads}
              activeId={session.activeThreadId}
              onOpen={session.openThread}
              onDelete={session.removeThread}
            />
            <span className="min-w-0 flex-1 truncate text-[12px] text-fg-muted">
              {session.threads.find((t) => t.id === session.activeThreadId)?.title ?? "New chat"}
            </span>
          </>
        ) : (
          <span className="text-fg-dim">agent</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {session.connected && (
            <button
              type="button"
              onClick={back}
              className="text-[11px] text-fg-muted underline decoration-dotted hover:text-fg"
            >
              change
            </button>
          )}
          <IconButton onClick={toggleAgent} aria-label="close agent panel" title={`close · ${modLabel} J`}>
            <X />
          </IconButton>
        </div>
      </div>

      {session.connected ? (
        <ChatThread
          thread={session.thread}
          busy={session.busy}
          error={session.error}
          modes={session.modes}
          currentMode={session.currentMode}
          onSetMode={session.setMode}
          onSend={session.send}
          onStop={session.cancel}
        />
      ) : session.connecting ? (
        <LoadingState label={`connecting${agent ? ` to ${agent.name}` : ""}…`} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          {pending && (
            <div className="m-3 rounded border border-accent/40 bg-accent/5 px-3 py-2 text-[12px] text-fg-dim">
              ✨ pick an agent below and it'll investigate right away.
            </div>
          )}
          {session.error && (
            <div className="m-3">
              <ErrorBanner message={session.error} />
            </div>
          )}
          <AgentPicker onPick={pick} />
        </div>
      )}

      {session.proposal && (
        <ProposalDialog proposal={session.proposal} onClose={session.clearProposal} />
      )}
    </div>
  );
}
