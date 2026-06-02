import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { AgentSessionUpdate } from "@/types";

// Renders one streamed turn (agent-panel spec §8): assistant text, thinking,
// and a card per tool call — the trust surface where every read the agent made
// (and any blocked write) is visible.
function UpdateRow({ u }: { u: AgentSessionUpdate }) {
  switch (u.type) {
    case "messageChunk":
      return <span className="whitespace-pre-wrap text-fg">{u.text}</span>;
    case "thoughtChunk":
      return <div className="whitespace-pre-wrap py-0.5 text-[12px] italic text-fg-muted">{u.text}</div>;
    case "toolCall":
      return (
        <div className="my-1 rounded border border-border bg-bg-elev px-2 py-1 text-[12px]">
          <span className="text-fg-muted">⚙ </span>
          <span className="text-accent">{u.tool}</span>
          <span className="break-all text-fg-muted"> {u.args}</span>
        </div>
      );
    case "toolResult": {
      const blocked = u.status === "blocked";
      const failed = u.status === "failed";
      return (
        <div
          className={`my-1 rounded border px-2 py-1 text-[12px] ${
            blocked || failed ? "border-err/40 text-err" : "border-border text-fg-dim"
          }`}
        >
          <span className="text-fg-muted">{blocked ? "⛔ " : failed ? "✕ " : "↳ "}</span>
          {u.summary ?? u.status}
        </div>
      );
    }
    case "done":
      return <div className="py-1 text-center text-[11px] text-fg-muted">— end of turn —</div>;
    case "error":
      return <div className="my-1 text-[12px] text-err">⚠ {u.message}</div>;
    default:
      return null;
  }
}

export function ChatThread({
  updates,
  busy,
  onSend,
}: {
  updates: AgentSessionUpdate[];
  busy: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [updates.length]);

  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto p-3 text-[13px] leading-relaxed">
        {updates.length === 0 && (
          <p className="text-fg-muted">
            Ask about your ECS resources — deployments, failing tasks, metrics, logs. The agent can
            take you to a screen or hand you a change to confirm; it never writes to AWS itself.
          </p>
        )}
        {updates.map((u, i) => (
          <UpdateRow key={i} u={u} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 py-1 text-fg-muted">
            <Spinner className="size-3.5" /> thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex shrink-0 items-end gap-2 border-t border-border p-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="ask the agent…"
          className="min-w-0 flex-1 resize-none rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || busy}
          className="rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
        >
          send
        </button>
      </div>
    </div>
  );
}
