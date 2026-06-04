import { useEffect, useState } from "react";
import { createChannel, invoke } from "@/lib/tauri";
import type { LogEvent, Scope } from "@/types";

const MAX_LINES = 2000;

// Subscribes to a backend log-tail channel; accumulates a capped buffer of events.
export function useLogTail(
  scope: Scope,
  logGroup: string | undefined,
  logStream: string | undefined,
  enabled: boolean,
  // When true, tail every stream in the group (all tasks) instead of one stream.
  allTasks = false,
): LogEvent[] {
  const [lines, setLines] = useState<LogEvent[]>([]);

  useEffect(() => {
    if (!enabled || !logGroup) return;
    if (!allTasks && !logStream) return;
    setLines([]);

    let tailId: number | null = null;
    let cancelled = false;
    const channel = createChannel<LogEvent>((event) => {
      setLines((prev) =>
        prev.length >= MAX_LINES ? [...prev.slice(prev.length - MAX_LINES + 1), event] : [...prev, event],
      );
    });

    const started = allTasks
      ? invoke("start_log_tail_group", { scope, logGroup, onEvent: channel })
      : invoke("start_log_tail", { scope, logGroup, logStream: logStream!, onEvent: channel });
    started
      .then((id) => {
        if (cancelled) void invoke("stop_log_tail", { tailId: id });
        else tailId = id;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (tailId != null) void invoke("stop_log_tail", { tailId });
    };
  }, [scope.profile, scope.region, logGroup, logStream, enabled, allTasks]);

  return lines;
}
