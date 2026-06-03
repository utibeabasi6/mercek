import { useSyncExternalStore } from "react";
import type { Scope } from "@/types";

// A sentinel observation: something worth a human's attention, detected by polling
// the resource graph. Reconciled each cycle so a finding keeps its `firstSeen` (and
// any dismissal) while it persists, and disappears when the condition clears.

export type ObsKind = "drift" | "stalled_deploy" | "flapping" | "oom" | "vuln";
export type Severity = "warn" | "critical";

export interface Observation {
  id: string;
  kind: ObsKind;
  severity: Severity;
  scope: Scope;
  cluster: string;
  service?: string;
  title: string;
  detail: string;
  firstSeen: number;
  lastSeen: number;
}

export type DetectedObservation = Omit<Observation, "firstSeen" | "lastSeen">;

interface Entry {
  obs: Observation;
  dismissed: boolean;
}

let entries = new Map<string, Entry>();
let snapshot: Observation[] = [];
let snapshotSig = "";
const listeners = new Set<() => void>();
const SEV_RANK: Record<Severity, number> = { critical: 0, warn: 1 };

function rebuild() {
  const next = [...entries.values()]
    .filter((e) => !e.dismissed)
    .map((e) => e.obs)
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.lastSeen - a.lastSeen);
  // Keep the snapshot's reference stable when the visible set is unchanged — the
  // sentinel reconciles every poll, but consumers should only re-render on a real
  // change (and useSyncExternalStore must get a stable snapshot otherwise).
  const sig = next.map((o) => `${o.id}:${o.severity}:${o.title}`).join("|");
  if (sig === snapshotSig) return;
  snapshotSig = sig;
  snapshot = next;
  for (const l of listeners) l();
}

// Merge a freshly-detected set: keep `firstSeen` + dismissal for findings that
// persist, stamp new ones, and drop resolved ones (which also clears their dismiss,
// so a recurrence shows again).
export function reconcile(detected: DetectedObservation[], now: number) {
  const next = new Map<string, Entry>();
  for (const d of detected) {
    const prev = entries.get(d.id);
    next.set(d.id, {
      dismissed: prev?.dismissed ?? false,
      obs: { ...d, firstSeen: prev?.obs.firstSeen ?? now, lastSeen: now },
    });
  }
  entries = next;
  rebuild();
}

export function dismissObservation(id: string) {
  const e = entries.get(id);
  if (e && !e.dismissed) {
    e.dismissed = true;
    rebuild();
  }
}

export function useObservations(): Observation[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
