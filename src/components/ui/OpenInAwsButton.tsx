import { ExternalLink } from "lucide-react";
import { openExternal } from "@/lib/open";

// A header action that opens the current resource in the AWS console. Styled to match
// the other detail-header buttons (scale / update / stop task).
export function OpenInAwsButton({ url, label = "AWS console" }: { url: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => openExternal(url)}
      title="open in the AWS console"
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-border px-2 py-1 text-fg-dim hover:border-border-strong hover:text-fg"
    >
      <ExternalLink size={13} />
      {label}
    </button>
  );
}
