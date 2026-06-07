import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { Select } from "@/components/ui/Select";
import { ChevronRight, Send, Square, Wrench } from "lucide-react";
import { ErrorBanner } from "@/components/ui/StateView";
import { Markdown } from "@/components/ui/Markdown";
import { invoke } from "@/lib/tauri";
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
// markdown block, and consecutive thought chunks one thinking block — both stream in
// piecewise (some harnesses token-by-token), so joining is what makes them read as
// prose instead of one word per line. User turns and tool/done/error updates stay as
// their own rows.
type Group =
  | { kind: "user"; key: number; text: string }
  | { kind: "assistant"; key: number; text: string }
  | { kind: "thought"; key: number; text: string }
  | { kind: "update"; key: number; update: AgentSessionUpdate };

function groupThread(thread: ThreadItem[]): Group[] {
  const groups: Group[] = [];
  // Open accumulator for whichever streamed kind we're mid-run on; flushed when the
  // kind changes or a standalone row (user/tool/done) interrupts it.
  let buf: { kind: "assistant" | "thought"; key: number; text: string } | null = null;
  const flush = () => {
    if (buf) {
      groups.push({ kind: buf.kind, key: buf.key, text: buf.text });
      buf = null;
    }
  };
  thread.forEach((item, i) => {
    if (item.role === "user") {
      flush();
      groups.push({ kind: "user", key: i, text: item.text });
      return;
    }
    const u = item.update;
    if (u.type === "messageChunk" || u.type === "thoughtChunk") {
      const kind = u.type === "messageChunk" ? "assistant" : "thought";
      if (!buf || buf.kind !== kind) {
        flush();
        buf = { kind, key: i, text: "" };
      }
      buf.text += u.text;
    } else if (u.type !== "toolCall" || ecsToolName(u.tool)) {
      flush();
      groups.push({ kind: "update", key: i, update: u });
    }
    // else: a harness-internal tool call — hidden (don't flush, so chunks stay joined).
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

// A coalesced thinking block. Reasoning can run long and is secondary, so collapsed
// (the default) it shows only the last ~3 lines — a rolling tail pinned to the freshest
// text as it streams — with a toggle to expand the whole thing. The top fades to hint
// there's more above, and the toggle hides itself when the thought already fits.
const THOUGHT_TAIL_LINES = 3;
const THOUGHT_LINE_HEIGHT = 1.6;

function ThoughtBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    // Collapsed: roll the window to the newest line and note whether more is hidden.
    el.scrollTop = el.scrollHeight;
    setOverflowing(el.scrollHeight - el.clientHeight > 2);
  }, [text, expanded]);

  const tail = `${THOUGHT_TAIL_LINES * THOUGHT_LINE_HEIGHT}em`;
  const fade = `linear-gradient(to bottom, transparent, #000 ${THOUGHT_LINE_HEIGHT}em)`;
  const faded = !expanded && overflowing;
  return (
    <div className="my-1 text-[12px] text-fg-muted">
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mb-0.5 flex items-center gap-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
        >
          <ChevronRight
            size={11}
            className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          Thinking
        </button>
      )}
      <div
        ref={ref}
        className="overflow-hidden whitespace-pre-wrap break-words italic"
        style={{
          lineHeight: THOUGHT_LINE_HEIGHT,
          maxHeight: expanded ? undefined : tail,
          WebkitMaskImage: faded ? fade : undefined,
          maskImage: faded ? fade : undefined,
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Renders one standalone streamed update: a card per tool call, tool results, the
// turn divider, errors, and permission prompts — the trust surface where every read
// the agent made (and any blocked write) is visible. Message and thought chunks are
// coalesced into their own groups upstream (`groupThread`), not rendered here.
function UpdateRow({ u }: { u: AgentSessionUpdate }) {
  switch (u.type) {
    case "toolCall": {
      const name = ecsToolName(u.tool) ?? u.tool;
      return (
        <div className="my-0.5 flex min-w-0 items-center gap-2 overflow-hidden rounded-md bg-bg-elev/50 px-2 py-1 text-[12px]">
          <Wrench size={12} className="shrink-0 text-fg-muted" />
          <span className="shrink-0 font-medium text-fg-dim" title={u.tool}>
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
    case "permissionRequest":
      return <PermissionCard u={u} />;
    default:
      return null;
  }
}

// The harness asked to use one of its own tools (file write / shell / …) in a mode that
// requires asking. The user decides here; Mercek's read-only ECS tools never prompt.
function PermissionCard({
  u,
}: {
  u: Extract<AgentSessionUpdate, { type: "permissionRequest" }>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const respond = (optionId: string | null, label: string) => {
    setChosen(label);
    void invoke("agent_respond_permission", { id: u.id, optionId });
  };
  return (
    <div className="my-1.5 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-warn">●</span>
        <span className="min-w-0 break-words text-fg">
          The agent wants to <span className="text-fg-dim">{u.title}</span>
          {u.kind ? ` · ${u.kind}` : ""}
        </span>
      </div>
      {chosen ? (
        <div className="mt-1.5 pl-4 text-fg-muted">→ {chosen}</div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2 pl-4">
          {u.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => respond(o.id, o.label)}
              className={
                o.allow
                  ? "rounded border border-accent bg-accent px-2 py-0.5 text-bg hover:opacity-90"
                  : "rounded border border-border px-2 py-0.5 text-fg-dim hover:border-err hover:text-err"
              }
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => respond(null, "denied")}
            className="rounded px-2 py-0.5 text-fg-muted hover:text-fg"
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
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

  // Recompute render groups only when the thread changes — not on every keystroke
  // in the composer or `busy` toggle.
  const groups = useMemo(() => groupThread(thread), [thread]);

  // Surface only the modes worth choosing — Default (asks before write/shell) and
  // Bypass Permissions (power-user opt-out). The harness still has the rest (Accept
  // Edits / Plan Mode / Don't Ask); they're just not listed.
  const shownModes = useMemo(
    () =>
      modes.filter((m) => {
        const s = `${m.id} ${m.name}`.toLowerCase();
        return s.includes("default") || s.includes("bypass");
      }),
    [modes],
  );

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
        {groups.map((g) =>
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
          ) : g.kind === "thought" ? (
            <ThoughtBlock key={g.key} text={g.text} />
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
      {/* Athas-style unified composer: textarea + an inline control row (mode + send). */}
      <div className="shrink-0 border-t border-border p-2">
        <div className="flex flex-col rounded-lg border border-border bg-bg-elev-2 transition-colors focus-within:border-accent">
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
            placeholder="Message Mercek about your ECS…"
            className="max-h-40 min-h-[40px] w-full resize-none bg-transparent px-3 py-2 text-fg outline-none placeholder:text-fg-muted"
          />
          <div className="flex items-center gap-2 px-2 pb-1.5">
            {shownModes.length > 0 && (
              <div className="min-w-0 max-w-[60%]">
                <Select
                  value={currentMode ?? ""}
                  onChange={onSetMode}
                  placeholder="Default"
                  options={shownModes.map((m) => ({ value: m.id, label: m.name }))}
                />
              </div>
            )}
            <div className="ml-auto flex items-center gap-1">
              {busy ? (
                <button
                  type="button"
                  onClick={onStop}
                  title="stop the current turn"
                  className="grid size-7 place-items-center rounded-md border border-err text-err transition-colors hover:bg-err hover:text-bg"
                >
                  <Square size={13} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submit}
                  disabled={!text.trim()}
                  title="send · ⏎"
                  className="grid size-7 place-items-center rounded-md bg-accent text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="px-1 pt-1 text-[10px] text-fg-muted">⏎ send · ⇧⏎ newline</div>
      </div>
    </div>
  );
}
