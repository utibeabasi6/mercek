import type { ReactNode } from "react";

export function ConfirmDialog({
  title,
  children,
  confirmLabel = "confirm",
  danger,
  busy,
  confirmDisabled,
  errorMessage,
  onConfirm,
  onClose,
}: {
  title: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  errorMessage?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[16vh]"
      onMouseDown={onClose}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[460px] max-w-[90vw] overflow-hidden rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-2.5 text-fg">{title}</div>
        <div className="flex flex-col gap-4 p-4">
          {children && <div className="text-[13px] text-fg-dim">{children}</div>}
          {errorMessage && <div className="text-[12px] text-err">{errorMessage}</div>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1 text-fg-dim hover:text-fg"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || confirmDisabled}
              className={`rounded border px-3 py-1 text-bg disabled:cursor-not-allowed disabled:opacity-50 ${
                danger ? "border-err bg-err" : "border-accent bg-accent"
              }`}
            >
              {busy ? "working…" : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
