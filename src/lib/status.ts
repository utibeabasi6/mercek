export type StatusTone = "ok" | "warn" | "err" | "info" | "draining" | "muted";

const OK = new Set(["active", "running", "healthy", "completed", "primary", "in_use", "healthy"]);
const WARN = new Set([
  "pending",
  "provisioning",
  "in_progress",
  "activating",
  "deactivating",
  "initial",
  "updating",
]);
const ERR = new Set(["failed", "unhealthy", "stopped", "stopping", "deprovisioning"]);
const DRAINING = new Set(["draining", "inactive", "unused", "unavailable"]);

export function toneFor(value: string): StatusTone {
  const v = value.toLowerCase();
  if (OK.has(v)) return "ok";
  if (WARN.has(v)) return "warn";
  if (ERR.has(v)) return "err";
  if (DRAINING.has(v)) return "draining";
  return "muted";
}

export const toneText: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  info: "text-info",
  draining: "text-draining",
  muted: "text-fg-muted",
};

export const toneBg: Record<StatusTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  info: "bg-info",
  draining: "bg-draining",
  muted: "bg-fg-muted",
};
