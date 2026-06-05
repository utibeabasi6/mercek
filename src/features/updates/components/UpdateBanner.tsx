import { useState } from "react";
import { useUpdater } from "@/features/updates/useUpdater";

// Shown only when a verified update is available (or while installing one). Sits with
// the other top banners; "later" dismisses it for the session.
export function UpdateBanner() {
  const { update, status, error, install } = useUpdater();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !update) return null;
  const busy = status === "downloading" || status === "ready";

  return (
    <div className="flex items-center gap-3 border-b border-border bg-bg-elev px-4 py-2 text-[12px]">
      <span className="text-accent">●</span>
      <span className="min-w-0 truncate text-fg">
        Mercek {update.version} is available
        {update.currentVersion ? ` — you're on ${update.currentVersion}` : ""}.
      </span>
      {status === "error" && error && (
        <span className="min-w-0 truncate text-err" title={error}>
          update failed: {error}
        </span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void install()}
          disabled={busy}
          className="rounded border border-accent bg-accent px-2 py-0.5 text-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "downloading"
            ? "downloading…"
            : status === "ready"
              ? "restarting…"
              : "Update & restart"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={busy}
          className="text-fg-muted hover:text-fg disabled:opacity-60"
        >
          later
        </button>
      </div>
    </div>
  );
}
