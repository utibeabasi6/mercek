import { useShell } from "@/app/shell";

// A sparkle button shown on error/unhealthy resources: opens the agent panel and
// asks it to diagnose the "why". If no harness is connected
// yet, the panel queues the message until the user picks one.
export function InvestigateButton({
  message,
  label = "investigate",
  title,
}: {
  message: string;
  label?: string;
  title?: string;
}) {
  const { askAgent } = useShell();
  return (
    <button
      type="button"
      onClick={() => askAgent(message)}
      title={title ?? "ask the agent to diagnose this"}
      className="inline-flex items-center gap-1 rounded border border-accent/50 px-2 py-0.5 text-[12px] text-accent hover:bg-accent hover:text-bg"
    >
      <span className="leading-none">✨</span>
      {label}
    </button>
  );
}
