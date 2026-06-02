export interface SubTab {
  id: string;
  label: string;
}

export function SubTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: SubTab[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-3">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b px-2 py-1.5 ${
            active === t.id
              ? "border-accent text-fg"
              : "border-transparent text-fg-muted hover:text-fg-dim"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-fg-muted">{label}</span>
      <span className="text-fg">{children}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] uppercase tracking-wide text-fg-muted">{title}</h3>
      {children}
    </section>
  );
}
