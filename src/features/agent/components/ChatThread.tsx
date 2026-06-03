import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Select } from "@/components/ui/Select";
import { ErrorBanner } from "@/components/ui/StateView";
import { Markdown } from "@/components/ui/Markdown";
import type { ThreadItem } from "@/features/agent/api";
import type { AgentMode, AgentSessionUpdate } from "@/types";

// Our ECS tools are the only tool calls worth surfacing. Everything else the
// harness can invoke (its Terminal, file reads, its own session files, …) is
// internal noise that also leaks local paths — those are hidden. Returns the bare
// tool name with the `mcp__<server>__` prefix stripped for ours, else null.
function ecsToolName(title: string): string | null {
  const m = /mercek-ecs-readonly__(.+)$/.exec(title);
  return m ? m[1] : null;
}

// Coalesce a thread into render groups: consecutive agent message chunks become one
// markdown block (they stream in piecewise), while user turns and tool/thought/done
// updates stay as their own rows. Without this, markdown can't be parsed — each
// chunk would render in isolation.
type Group =
  | { kind: "user"; key: number; text: string }
  | { kind: "assistant"; key: number; text: string }
  | { kind: "update"; key: number; update: AgentSessionUpdate };

function groupThread(thread: ThreadItem[]): Group[] {
  const groups: Group[] = [];
  let buf: { key: number; text: string } | null = null;
  const flush = () => {
    if (buf) {
      groups.push({ kind: "assistant", key: buf.key, text: buf.text });
      buf = null;
    }
  };
  thread.forEach((item, i) => {
    if (item.role === "user") {
      flush();
      groups.push({ kind: "user", key: i, text: item.text });
    } else if (item.update.type === "messageChunk") {
      if (!buf) buf = { key: i, text: "" };
      buf.text += item.update.text;
    } else if (item.update.type !== "toolCall" || ecsToolName(item.update.tool)) {
      flush();
      groups.push({ kind: "update", key: i, update: item.update });
    }
    // else: a harness-internal tool call — hidden (don't flush, so text stays joined).
  });
  flush();
  return groups;
}

// Starter prompts shown on an empty thread; clicking one sends it.
const EXAMPLES = [
  "List all my clusters",
  "Which services are unhealthy right now?",
  "When was the last deploy to prod?",
  "Is anything over-provisioned?",
];

// Renders one streamed update: thinking, and a card per tool call — the trust
// surface where every read the agent made (and any blocked write) is visible.
function UpdateRow({ u }: { u: AgentSessionUpdate }) {
  switch (u.type) {
    case "messageChunk":
      return <span className="whitespace-pre-wrap break-words text-fg">{u.text}</span>;
    case "thoughtChunk":
      return (
        <div className="whitespace-pre-wrap break-words py-0.5 text-[12px] italic text-fg-muted">
          {u.text}
        </div>
      );
    case "toolCall": {
      const name = ecsToolName(u.tool) ?? u.tool;
      return (
        <div className="my-1 flex min-w-0 items-center gap-1.5 overflow-hidden rounded border border-border bg-bg-elev px-2 py-1 text-[12px]">
          <span className="shrink-0 text-fg-muted">⚙</span>
          <span className="shrink truncate font-medium text-accent" title={u.tool}>
            {name}
          </span>
          {u.args && u.args !== "{}" && (
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-muted"
              title={u.args}
            >
              {u.args}
            </span>
          )}
        </div>
      );
    }
    case "toolResult": {
      const blocked = u.status === "blocked";
      const failed = u.status === "failed";
      return (
        <div
          className={`my-1 min-w-0 break-words rounded border px-2 py-1 text-[12px] ${
            blocked || failed ? "border-err/40 text-err" : "border-border text-fg-dim"
          }`}
        >
          <span className="text-fg-muted">{blocked ? "⛔ " : failed ? "✕ " : "↳ "}</span>
          {u.summary ?? u.status}
        </div>
      );
    }
    case "done":
      return <div className="mx-auto my-3 h-px w-full bg-border/60" aria-hidden />;
    case "error":
      return <div className="my-1 break-words text-[12px] text-err">⚠ {u.message}</div>;
    default:
      return null;
  }
}

export function ChatThread({
  thread,
  busy,
  error,
  modes,
  currentMode,
  onSetMode,
  onSend,
  onStop,
}: {
  thread: ThreadItem[];
  busy: boolean;
  error?: string | null;
  modes: AgentMode[];
  currentMode: string | null;
  onSetMode: (id: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Stay pinned to the bottom only when the user is already there — don't yank the
  // view down while they're scrolled up reading earlier messages.
  const pinnedRef = useRef(true);

  useEffect(() => {
    if (pinnedRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [thread.length, busy]);

  // Auto-grow the input with its content, up to a few lines.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const submit = () => {
    if (!text.trim() || busy) return;
    pinnedRef.current = true;
    onSend(text);
    setText("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto p-3 text-[13px] leading-relaxed"
      >
        {thread.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-fg-muted">
              Ask about your ECS resources — deployments, failing tasks, metrics, logs. The agent
              reads live AWS through Mercek; it can take you to a screen or hand you a change to
              confirm, but never writes to AWS itself.
            </p>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wide text-fg-muted">try</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    pinnedRef.current = true;
                    onSend(ex);
                  }}
                  className="rounded border border-border bg-bg-elev px-2.5 py-1.5 text-left text-fg-dim transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {groupThread(thread).map((g) =>
          g.kind === "user" ? (
            <div key={g.key} className="my-2 flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-accent/15 px-2.5 py-1.5 text-fg ring-1 ring-accent/30">
                {g.text}
              </div>
            </div>
          ) : g.kind === "assistant" ? (
            <div key={g.key} className="my-1.5">
              <Markdown>{g.text}</Markdown>
            </div>
          ) : (
            <UpdateRow key={g.key} u={g.update} />
          ),
        )}
        {busy && (
          <div className="flex items-center gap-2 py-1 text-fg-muted">
            <Spinner className="size-3.5" />
            <span>thinking</span>
            <span className="inline-flex">
              <span style={{ animation: "mercek-blink 1.2s infinite" }}>.</span>
              <span style={{ animation: "mercek-blink 1.2s infinite 0.2s" }}>.</span>
              <span style={{ animation: "mercek-blink 1.2s infinite 0.4s" }}>.</span>
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && (
        <div className="shrink-0 px-2">
          <ErrorBanner message={error} />
        </div>
      )}
      {modes.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-2 pt-2">
          <span className="shrink-0 text-[11px] text-fg-muted">mode</span>
          <div className="min-w-0 flex-1">
            <Select
              value={currentMode ?? ""}
              onChange={onSetMode}
              placeholder="default"
              options={modes.map((m) => ({ value: m.id, label: m.name }))}
            />
          </div>
        </div>
      )}
      <div
        className={`flex shrink-0 items-end gap-2 p-2 ${
          modes.length > 0 ? "" : "border-t border-border"
        }`}
      >
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="ask the agent…   ⏎ send · ⇧⏎ newline"
          className="max-h-40 min-h-[38px] min-w-0 flex-1 resize-none rounded border border-border bg-bg-elev-2 px-2 py-1.5 text-fg outline-none focus:border-accent"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            title="stop the current turn"
            className="shrink-0 rounded border border-err px-3 py-1 text-err hover:bg-err hover:text-bg"
          >
            stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="shrink-0 rounded border border-accent bg-accent px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            send
          </button>
        )}
      </div>
    </div>
  );
}
