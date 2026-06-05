export interface MultiCheckOption {
  value: string;
  label: string;
  hint?: string;
}

// A compact, scrollable checkbox list for picking several IDs (subnets, security
// groups). Inline rather than a dropdown — the lists are short and seeing every option
// at once beats hiding them behind a menu.
export function MultiCheck({
  options,
  selected,
  onChange,
  empty = "none available",
}: {
  options: MultiCheckOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  empty?: string;
}) {
  if (options.length === 0) {
    return <div className="text-[12px] text-fg-muted">{empty}</div>;
  }
  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="flex max-h-44 min-w-0 flex-1 flex-col gap-0.5 overflow-auto rounded border border-border bg-bg-elev-2 p-1.5">
      {options.map((o) => (
        <label
          key={o.value}
          title={o.hint ? `${o.value} · ${o.hint}` : o.value}
          className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-bg-elev"
        >
          <input
            type="checkbox"
            checked={selected.includes(o.value)}
            onChange={() => toggle(o.value)}
            className="shrink-0 accent-accent"
          />
          <span className="shrink-0 font-mono text-fg">{o.value}</span>
          {o.hint && <span className="min-w-0 truncate text-fg-dim">{o.hint}</span>}
        </label>
      ))}
    </div>
  );
}
