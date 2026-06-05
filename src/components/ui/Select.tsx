import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  options,
  onChange,
  onOpen,
  loading,
  placeholder = "select…",
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  onOpen?: () => void;
  loading?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = () => {
    setOpen((o) => {
      if (!o) {
        onOpen?.();
        // Flip the menu upward when there isn't room below (e.g. the agent panel's
        // mode selector sits at the bottom edge) so it isn't clipped.
        const rect = btnRef.current?.getBoundingClientRect();
        if (rect) setDropUp(window.innerHeight - rect.bottom < 240);
      }
      return !o;
    });
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded border border-border bg-bg-elev-2 px-2 py-1 text-left text-fg outline-none hover:border-border-strong"
      >
        <span className="min-w-0 flex-1 truncate" title={selected?.label}>
          {selected?.label ?? placeholder}
        </span>
        {loading && <Spinner className="size-3" />}
        <span className="shrink-0 text-[10px] text-fg-muted">▾</span>
      </button>
      {open && (
        <div
          // Size the menu to its content (at least the trigger width, capped so it can't
          // run off-screen) instead of locking it to the trigger — otherwise long option
          // labels truncate even when there's room. Each option keeps a title tooltip.
          className={`absolute left-0 z-20 max-h-48 w-max min-w-full max-w-[18rem] overflow-auto rounded border border-border-strong bg-bg-elev py-1 shadow-2xl ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {loading && options.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-1.5 text-fg-muted">
              <Spinner className="size-3" /> loading…
            </div>
          ) : options.length === 0 ? (
            <div className="px-2 py-1.5 text-fg-muted">no items</div>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                title={o.label}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`block w-full truncate px-2 py-1 text-left hover:bg-bg-elev-2 ${
                  o.value === value ? "text-accent" : "text-fg-dim"
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
