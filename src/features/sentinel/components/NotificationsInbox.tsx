import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useObservations } from "@/features/sentinel/store";
import { ObservationList } from "@/features/sentinel/components/ObservationList";

// Titlebar bell + unread badge → a dropdown of the sentinel's open findings.
export function NotificationsInbox() {
  const obs = useObservations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const hasCritical = obs.some((o) => o.severity === "critical");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={() => setOpen((o) => !o)}
        title="observations"
        aria-label={`observations${obs.length ? ` (${obs.length})` : ""}`}
        className="relative"
      >
        <Bell size={16} />
        {obs.length > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-medium text-bg ${
              hasCritical ? "bg-err" : "bg-warn"
            }`}
          >
            {obs.length}
          </span>
        )}
      </IconButton>
      {open && (
        <div className="absolute right-0 top-9 z-30 max-h-96 w-80 overflow-auto rounded border border-border-strong bg-bg-elev shadow-2xl">
          <div className="border-b border-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-fg-muted">
            observations
          </div>
          <ObservationList items={obs} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
