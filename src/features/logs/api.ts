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
): LogEvent[] {
  const [lines, setLines] = useState<LogEvent[]>([]);

  useEffect(() => {
    if (!enabled || !logGroup || !logStream) return;
    setLines([]);

    let tailId: number | null = null;
    let cancelled = false;
    const channel = createChannel<LogEvent>((event) => {
      setLines((prev) =>
        prev.length >= MAX_LINES ? [...prev.slice(prev.length - MAX_LINES + 1), event] : [...prev, event],
      );
    });

    invoke("start_log_tail", { scope, logGroup, logStream, onEvent: channel })
      .then((id) => {
        if (cancelled) void invoke("stop_log_tail", { tailId: id });
        else tailId = id;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (tailId != null) void invoke("stop_log_tail", { tailId });
    };
  }, [scope.profile, scope.region, logGroup, logStream, enabled]);

  return lines;
}
