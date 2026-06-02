import { useEffect } from "react";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

export const modLabel = isMac ? "⌘" : "Ctrl";

export function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split("+");
  const key = parts[parts.length - 1];
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (parts.includes("mod") !== mod) return false;
  if (parts.includes("shift") !== e.shiftKey) return false;
  if (parts.includes("alt") !== e.altKey) return false;
  return e.key.toLowerCase() === key;
}

export type KeyMap = Record<string, (e: KeyboardEvent) => void>;

export function useKeybindings(map: KeyMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      for (const combo of Object.keys(map)) {
        if (matchCombo(e, combo)) {
          e.preventDefault();
          map[combo](e);
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map, enabled]);
}
