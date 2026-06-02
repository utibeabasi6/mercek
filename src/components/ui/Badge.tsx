import { toneBg, toneFor, toneText, type StatusTone } from "@/lib/status";

export function StatusGlyph({ status, tone }: { status?: string; tone?: StatusTone }) {
  const t = tone ?? toneFor(status ?? "");
  return <span className={`${toneText[t]} text-[10px] leading-none`}>●</span>;
}

export function StatusBadge({ status, tone }: { status: string; tone?: StatusTone }) {
  const t = tone ?? toneFor(status);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block size-1.5 rounded-full ${toneBg[t]}`} />
      <span className={toneText[t]}>{status}</span>
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-bg-elev-2 px-1.5 py-0.5 text-[11px] text-fg-dim">
      {children}
    </kbd>
  );
}

export function Count({ label, value, tone }: { label: string; value: number; tone?: StatusTone }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`tabular-nums ${tone ? toneText[tone] : "text-fg"}`}>{value}</span>
      <span className="text-fg-muted">{label}</span>
    </span>
  );
}
