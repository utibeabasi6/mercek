import { AgentPanel } from "@/features/agent/components/AgentPanel";

// The reserved agent surface, now lit up. Width + visibility are
// owned by AppShell (mirrors the Drawer); this just renders the panel at the
// given width when open.
export function RightPanel({ open, width }: { open: boolean; width: number }) {
  if (!open) return null;
  return (
    <div style={{ width }} className="shrink-0 border-l border-border">
      <AgentPanel />
    </div>
  );
}
