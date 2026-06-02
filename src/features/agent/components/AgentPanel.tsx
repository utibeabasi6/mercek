import { useState } from "react";
import { useShell } from "@/app/shell";
import { modLabel } from "@/app/keybindings";
import { useAgentSession } from "@/features/agent/api";
import { AgentPicker } from "@/features/agent/components/AgentPicker";
import { ChatThread } from "@/features/agent/components/ChatThread";
import { ProposalDialog } from "@/features/agent/components/ProposalDialog";
import type { AgentInfo } from "@/types";

// The reserved right-panel slot, lit up (agent-panel spec §8, §11.6): pick a
// harness → connect → chat. The agent's reads, navigations, and the prefilled
// confirm dialog all surface here; it never writes to AWS itself (§4).
export function AgentPanel() {
  const { toggleAgent } = useShell();
  const session = useAgentSession();
  const [agent, setAgent] = useState<AgentInfo | null>(null);

  const pick = async (a: AgentInfo) => {
    setAgent(a);
    if (!(await session.connect(a.id))) setAgent(null);
  };
  const back = async () => {
    await session.disconnect();
    setAgent(null);
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-fg-dim">◇ agent</span>
        {session.connected && agent && (
          <span className="truncate text-[12px] text-fg-muted">{agent.name}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {session.connected && (
            <button
              type="button"
              onClick={back}
              className="text-[11px] text-fg-muted underline decoration-dotted hover:text-fg"
            >
              change
            </button>
          )}
          <button
            type="button"
            onClick={toggleAgent}
            aria-label="close agent panel"
            title={`close · ${modLabel} J`}
            className="flex size-6 items-center justify-center rounded text-[16px] leading-none text-fg-muted hover:bg-bg-elev-2 hover:text-fg"
          >
            ✕
          </button>
        </div>
      </div>

      {!session.connected ? (
        <div className="min-h-0 flex-1 overflow-auto">
          {session.error && (
            <div className="m-3 rounded border border-err/40 px-3 py-2 text-[12px] text-err">
              {session.error}
            </div>
          )}
          <AgentPicker onPick={pick} />
        </div>
      ) : (
        <ChatThread updates={session.updates} busy={session.busy} onSend={session.send} />
      )}

      {session.proposal && (
        <ProposalDialog proposal={session.proposal} onClose={session.clearProposal} />
      )}
    </div>
  );
}
