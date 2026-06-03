import { useSyncExternalStore } from "react";

// Tiny reactive localStorage-backed user preferences. Components read with
// `usePref` and re-render when any pref changes; writes go through `setPref`.
// UI state only — never credentials or secrets.

const listeners = new Set<() => void>();

export function getPref(key: string): string | null {
  return localStorage.getItem(key);
}

export function setPref(key: string, value: string | null) {
  if (value === null || value === "") localStorage.removeItem(key);
  else localStorage.setItem(key, value);
  listeners.forEach((l) => l());
}

export function usePref(key: string): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => localStorage.getItem(key),
    () => null,
  );
}

export const PREF = {
  /** id of the harness to connect by default. */
  defaultAgent: "mercek.defaultAgent",
  /** model the harness should use, per agent id (harness-dependent). */
  agentModel: (id: string) => `mercek.agentModel.${id}`,
};
