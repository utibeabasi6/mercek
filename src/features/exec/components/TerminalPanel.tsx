import { useEffect, useRef, useState } from "react";
import { Terminal, useTerminal } from "@wterm/react";
import "@wterm/react/css";
import { createChannel, invoke } from "@/lib/tauri";
import { useClusterResources } from "@/features/discovery/api";
import { useEnableExec } from "@/features/services/api";
import { Select } from "@/components/ui/Select";
import { appErrorMessage } from "@/lib/errors";
import type { AppError, Scope } from "@/types";

// `aws ecs execute-command` runs INSIDE the PTY, so its errors arrive as terminal
// output, not as a failure from exec_start — we sniff the output stream for them.
const NOT_ENABLED = /execute command was not enabled|execute command agent isn'?t running/i;
const NO_SHELL = /no such file|executable file not found|exec.*failed/i;

// An ECS Exec interactive shell: the backend spawns `aws ecs execute-command
// --interactive` under a PTY and streams its output here; keystrokes/resizes go back.
export function TerminalPanel({
  scope,
  cluster,
  taskArn,
}: {
  scope: Scope;
  cluster: string;
  taskArn: string;
}) {
  const { data: resources } = useClusterResources(scope, cluster);
  const task = resources?.tasks.find((t) => t.arn === taskArn) ?? null;
  const [containerName, setContainerName] = useState<string | null>(null);
  const selected = containerName ?? task?.containers[0]?.name ?? null;
  const service = task?.service ?? null;

  // The command to run. Many images have /bin/sh; some (distroless/scratch) don't, so
  // it's editable — try /bin/bash, /bin/ash, or any binary the image actually ships.
  const [command, setCommand] = useState("/bin/sh");
  const [draft, setDraft] = useState("/bin/sh");
  const [nonce, setNonce] = useState(0);

  const { ref, write } = useTerminal();
  const writeRef = useRef(write);
  writeRef.current = write;
  const sessionRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [execBlocked, setExecBlocked] = useState(false);
  const [shellMissing, setShellMissing] = useState(false);
  const [enabledHint, setEnabledHint] = useState(false);
  const enableExec = useEnableExec(scope, cluster);

  useEffect(() => {
    if (!task || !selected) return;
    setConnected(false);
    setError(null);
    setExecBlocked(false);
    setShellMissing(false);

    let cancelled = false;
    let sid: number | null = null;
    const channel = createChannel<string>((chunk) => {
      writeRef.current(chunk);
      if (NOT_ENABLED.test(chunk)) setExecBlocked(true);
      else if (NO_SHELL.test(chunk)) setShellMissing(true);
    });

    invoke("exec_start", {
      scope,
      cluster,
      task: taskArn,
      container: selected,
      command,
      rows: 24,
      cols: 80,
      onOutput: channel,
    })
      .then((id) => {
        if (cancelled) {
          void invoke("exec_stop", { session: id });
          return;
        }
        sid = id;
        sessionRef.current = id;
        setConnected(true);
      })
      .catch((e) => setError(appErrorMessage(e as AppError)));

    return () => {
      cancelled = true;
      sessionRef.current = null;
      if (sid != null) void invoke("exec_stop", { session: sid });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.profile, scope.region, cluster, taskArn, selected, command, nonce]);

  const reconnect = () => {
    setCommand(draft.trim() || "/bin/sh");
    setNonce((n) => n + 1);
  };

  if (!task) {
    return <div className="p-3 text-fg-muted">loading task…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px]">
        <div className="w-40 shrink-0">
          <Select
            value={selected ?? ""}
            onChange={setContainerName}
            options={task.containers.map((c) => ({ value: c.name, label: c.name }))}
          />
        </div>
        <input
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reconnect();
          }}
          title="command to run — some containers lack /bin/sh; try /bin/bash or /bin/ash"
          className="w-40 rounded border border-border bg-bg-elev-2 px-2 py-0.5 text-fg outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={reconnect}
          className="shrink-0 text-fg-muted hover:text-fg"
          title="reconnect with this command"
        >
          ↻ reconnect
        </button>
        <span className={`shrink-0 ${connected ? "text-ok" : "text-fg-muted"}`}>
          {connected ? "● connected" : "connecting…"}
        </span>
        <span className="ml-auto truncate text-fg-muted">{selected}</span>
      </div>

      {error ? (
        <div className="whitespace-pre-wrap p-3 text-[12px] text-err">
          {error}
          {"\n\n"}ECS Exec needs the AWS CLI + session-manager-plugin installed locally.
        </div>
      ) : (
        <>
          <div className="mercek-term min-h-0 flex-1 overflow-hidden">
            <Terminal
              ref={ref}
              autoResize
              cursorBlink
              onData={(data) => {
                if (sessionRef.current != null) {
                  void invoke("exec_write", { session: sessionRef.current, data });
                }
              }}
              onResize={(cols, rows) => {
                if (sessionRef.current != null) {
                  void invoke("exec_resize", { session: sessionRef.current, rows, cols });
                }
              }}
            />
          </div>

          {(execBlocked || shellMissing) && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border bg-bg-elev-2 px-3 py-2 text-[12px]">
              {execBlocked ? (
                <>
                  <span className="text-warn">
                    ECS Exec isn't enabled/ready{service ? ` on ${service}` : ""}.
                  </span>
                  {service && (
                    <button
                      type="button"
                      disabled={enableExec.isPending}
                      onClick={() =>
                        enableExec.mutate(service, {
                          onSuccess: () => {
                            setEnabledHint(true);
                            setExecBlocked(false);
                          },
                        })
                      }
                      className="rounded border border-accent bg-accent px-2 py-0.5 text-bg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enableExec.isPending ? "enabling…" : "enable ECS Exec & restart tasks"}
                    </button>
                  )}
                  {enabledHint && (
                    <span className="text-ok">restarting tasks — reconnect in ~1 min</span>
                  )}
                  {enableExec.isError && (
                    <span className="text-err">
                      {appErrorMessage(enableExec.error as unknown as AppError)}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-warn">
                  "{command}" isn't in this container. Try another command (e.g. /bin/bash or
                  /bin/ash) and reconnect.
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
