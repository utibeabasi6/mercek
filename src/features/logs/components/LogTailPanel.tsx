import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useShell } from "@/app/shell";
import { useClusterResources, useTaskDefinition } from "@/features/discovery/api";
import { useLogTail } from "@/features/logs/api";
import { Select } from "@/components/ui/Select";
import { arnName } from "@/lib/arn";
import type { Scope } from "@/types";

// Heuristic log-level coloring from the message text.
function levelClass(msg: string): string {
  if (/\b(error|fatal|panic|exception|traceback)\b/i.test(msg)) return "text-err";
  if (/\bwarn(ing)?\b/i.test(msg)) return "text-warn";
  return "text-fg-dim";
}

export function LogTailPanel({
  scope,
  cluster,
  taskArn,
  initialAllTasks = false,
}: {
  scope: Scope;
  cluster: string;
  taskArn: string;
  initialAllTasks?: boolean;
}) {
  const { data: resources } = useClusterResources(scope, cluster);
  const task = resources?.tasks.find((t) => t.arn === taskArn) ?? null;
  const { data: taskDef } = useTaskDefinition(scope, task?.taskDefArn, !!task);

  const [containerName, setContainerName] = useState<string | null>(null);
  const [tailing, setTailing] = useState(true);
  const [wrap, setWrap] = useState(true);
  const [filter, setFilter] = useState("");
  const [allTasks, setAllTasks] = useState(initialAllTasks);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = containerName ?? task?.containers[0]?.name ?? null;
  const taskId = arnName(taskArn);

  const { group, stream } = useMemo(() => {
    const cd = taskDef?.containerDefs.find((c) => c.name === selected);
    const lc = cd?.logConfig ?? null;
    const group = lc?.logGroup ?? lc?.options?.["awslogs-group"];
    const prefix = lc?.options?.["awslogs-stream-prefix"];
    const stream = group
      ? prefix
        ? `${prefix}/${selected}/${taskId}`
        : `${selected}/${taskId}`
      : undefined;
    return { group, stream };
  }, [taskDef, selected, taskId]);

  const lines = useLogTail(
    scope,
    group,
    stream,
    tailing && !!group && (allTasks || !!stream),
    allTasks,
  );
  const { askAgent } = useShell();

  // Client-side substring filter; keep each line's original index so "investigate"
  // still windows ±10 lines in the full stream, not the filtered view.
  const q = filter.trim().toLowerCase();
  const shown = useMemo(
    () => lines.map((l, i) => ({ l, i })).filter(({ l }) => !q || l.message.toLowerCase().includes(q)),
    [lines, q],
  );
  const dumpText = () => shown.map(({ l }) => `${l.timestamp} ${l.message}`).join("\n");
  const copyAll = () => void navigator.clipboard?.writeText(dumpText());
  const download = () => {
    const url = URL.createObjectURL(new Blob([dumpText()], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${taskId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Ask the agent to diagnose, attaching ±10 lines around the chosen one.
  const investigateLine = (i: number) => {
    const from = Math.max(0, i - 10);
    const to = Math.min(lines.length, i + 11);
    const window = lines
      .slice(from, to)
      .map((ln, j) => `${from + j === i ? "» " : "  "}${ln.timestamp.slice(11, 19)} ${ln.message}`)
      .join("\n");
    askAgent(
      `Investigate this log window from container \`${selected}\` of task ${taskArn} (service ${
        task?.service ?? "?"
      }, cluster ${cluster}). The line marked » is the one I'm asking about. Correlate with the ` +
        `task's stop reason / container exit codes, the service events, and the deployment, then ` +
        `tell me what's happening and the fix.\n\n\`\`\`\n${window}\n\`\`\``,
    );
  };

  useEffect(() => {
    if (tailing && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, tailing]);

  if (!task) {
    return <div className="p-3 text-fg-muted">loading task…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
        <div className="w-44">
          <Select
            value={selected ?? ""}
            onChange={setContainerName}
            options={task.containers.map((c) => ({ value: c.name, label: c.name }))}
          />
        </div>
        <button
          type="button"
          onClick={() => setTailing((t) => !t)}
          className={tailing ? "text-ok" : "text-fg-muted"}
        >
          {tailing ? "● tailing" : "▶ paused"}
        </button>
        <button
          type="button"
          onClick={() => setWrap((w) => !w)}
          className={wrap ? "text-fg" : "text-fg-muted"}
        >
          wrap
        </button>
        <button
          type="button"
          onClick={() => setAllTasks((a) => !a)}
          className={allTasks ? "text-accent" : "text-fg-muted"}
          title="tail every task's stream in this log group"
        >
          all tasks
        </button>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter…"
          className="w-40 rounded border border-border bg-bg-elev-2 px-2 py-0.5 text-fg outline-none focus:border-accent"
        />
        {filter && (
          <span className="text-fg-muted">
            {shown.length}/{lines.length}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={copyAll}
            className="text-fg-muted hover:text-fg"
            title="copy visible lines"
          >
            copy
          </button>
          <button
            type="button"
            onClick={download}
            className="text-fg-muted hover:text-fg"
            title="download visible lines"
          >
            download
          </button>
          {group && (
            <span className="max-w-[200px] truncate text-fg-muted" title={`${group} · ${stream}`}>
              {group}
            </span>
          )}
        </div>
      </div>

      {!group ? (
        <div className="p-3 text-fg-muted">
          container "{selected}" has no awslogs configuration
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={`flex-1 overflow-auto p-2 text-[12px] leading-relaxed ${
            wrap ? "whitespace-pre-wrap break-all" : "overflow-x-auto whitespace-pre"
          }`}
        >
          {lines.length === 0 ? (
            <div className="text-fg-muted">waiting for log events…</div>
          ) : shown.length === 0 ? (
            <div className="text-fg-muted">no lines match "{filter}"</div>
          ) : (
            shown.map(({ l, i }) => (
              <div key={i} className="group flex gap-3">
                <span className="shrink-0 text-fg-muted">{l.timestamp.slice(11, 19)}</span>
                {allTasks && (
                  <span
                    className="w-28 shrink-0 truncate text-fg-muted"
                    title={l.stream ?? ""}
                  >
                    {(l.stream?.split("/").pop() ?? "").slice(0, 14)}
                  </span>
                )}
                <span className={`min-w-0 flex-1 ${levelClass(l.message)}`}>{l.message}</span>
                <button
                  type="button"
                  onClick={() => investigateLine(i)}
                  title="ask the agent to investigate around this line"
                  className="shrink-0 self-start leading-relaxed text-accent opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
                >
                  <Sparkles size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
