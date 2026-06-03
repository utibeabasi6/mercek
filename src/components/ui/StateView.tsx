import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";

// Consistent loading / empty / error surfaces, used across detail views, metrics,
// and the agent panel so every async screen reads the same way.

export function LoadingState({ label = "loading…" }: { label?: string }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center gap-2 p-6 text-fg-muted">
      <Spinner className="size-4" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ label, children }: { label?: string; children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center p-6 text-center text-fg-muted">
      {children ?? label}
    </div>
  );
}

export function ErrorState({
  title = "something went wrong",
  detail,
  onRetry,
}: {
  title?: ReactNode;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex h-full min-h-24 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="text-[18px] leading-none text-err">⚠</span>
      <div className="text-fg">{title}</div>
      {detail && <div className="max-w-md break-words text-[12px] text-fg-dim">{detail}</div>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded border border-border px-3 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
        >
          retry
        </button>
      )}
    </div>
  );
}

// Compact inline error (e.g. above an input), not a full-area takeover.
export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded border border-err/40 bg-err/5 px-3 py-2 text-[12px] text-err">
      <span className="shrink-0">⚠</span>
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="dismiss"
          className="shrink-0 text-err/70 hover:text-err"
        >
          ✕
        </button>
      )}
    </div>
  );
}
