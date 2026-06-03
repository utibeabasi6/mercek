import { useEffect, useRef, useState } from "react";
import { History, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import type { ThreadMeta } from "@/features/agent/thread";

// Chat-history dropdown: switch to a past conversation or delete one. Saved
// transcripts live in localStorage (see lib/agentHistory).
export function ThreadMenu({
  threads,
  activeId,
  onOpen,
  onDelete,
}: {
  threads: ThreadMeta[];
  activeId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <IconButton onClick={() => setOpen((o) => !o)} title="chat history" aria-label="chat history">
        <History />
      </IconButton>
      {open && (
        <div className="absolute left-0 top-9 z-50 max-h-80 w-72 overflow-auto rounded border border-border bg-bg-elev py-1 shadow-lg">
          <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-fg-muted">
            chat history
          </div>
          {threads.length === 0 ? (
            <div className="px-2 py-1.5 text-[12px] text-fg-muted">No saved chats yet.</div>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                className={`group flex items-center gap-1.5 px-2 py-1.5 text-[12px] hover:bg-bg-elev-2 ${
                  t.id === activeId ? "text-fg" : "text-fg-dim"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onOpen(t.id);
                    setOpen(false);
                  }}
                  className="min-w-0 flex-1 truncate text-left"
                  title={t.title}
                >
                  {t.id === activeId && <span className="text-accent">● </span>}
                  {t.title}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  title="delete chat"
                  aria-label="delete chat"
                  className="shrink-0 text-fg-muted opacity-0 transition-opacity hover:text-err group-hover:opacity-100"
                >
                  <X size={13} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
