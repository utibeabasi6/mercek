import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Render agent output as markdown with theme-consistent styling, hardened because the
// text is untrusted: it's LLM/agent output, and the agent reads attacker-influenceable
// ECS fields (service/cluster/task names, tags, CloudWatch log lines) — a prompt-injection
// channel. Defences:
//   • Raw HTML is ignored (react-markdown default — no dangerouslySetInnerHTML).
//   • Remote images never load: the `img` override renders inert alt text instead of an
//     <img src>, which the webview would otherwise auto-GET on render — a zero-click
//     data-exfiltration beacon for the AWS state the agent just read.
//   • safeUrlTransform restricts URLs to http/https/mailto/relative as a backstop for
//     link nodes (and blocks protocol-relative "//host").
// GFM adds tables, strikethrough, task lists, autolinks.

// Allow only safe, human-navigable URL schemes; same-document relative URLs pass through.
// Protocol-relative ("//host") and non-allowlisted schemes (javascript:, data:, …) become
// "" so react-markdown emits no href/src. Exported for unit testing.
export function safeUrlTransform(url: string): string {
  // "//host" carries no scheme but resolves to a remote origin — block outright.
  if (url.startsWith("//")) return "";
  const colon = url.indexOf(":");
  if (colon === -1) return url; // no scheme → relative reference
  // A colon after the first /, ?, or # isn't a scheme delimiter — it's a relative path.
  const slash = url.indexOf("/");
  const query = url.indexOf("?");
  const hash = url.indexOf("#");
  if (
    (slash !== -1 && colon > slash) ||
    (query !== -1 && colon > query) ||
    (hash !== -1 && colon > hash)
  ) {
    return url;
  }
  const scheme = url.slice(0, colon).toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto" ? url : "";
}

const components: Components = {
  p: ({ children }) => (
    <p className="my-1.5 break-words leading-relaxed first:mt-0 last:mb-0">{children}</p>
  ),
  h1: ({ children }) => (
    <h1 className="mb-1.5 mt-3 text-[15px] font-semibold text-fg first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[14px] font-semibold text-fg first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2 text-[13px] font-semibold text-fg first:mt-0">{children}</h3>
  ),
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="break-words leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {children}
    </a>
  ),
  // Never emit <img src> from a model-supplied URL — the webview auto-GETs it on render
  // (a zero-click exfil beacon). Show the alt text inert instead, no network request.
  img: ({ alt, title }) => (
    <span className="italic text-fg-muted" title={title ?? undefined}>
      {alt ?? "image"}
    </span>
  ),
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-border pl-3 text-fg-dim">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  // react-markdown wraps block code in <pre><code>; we flatten <pre> and let the
  // <code> renderer decide block vs inline, so styling stays in one place.
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? "") || String(children).includes("\n");
    return isBlock ? (
      <pre className="my-2 overflow-x-auto rounded border border-border bg-bg-elev-2 p-2 font-mono text-[12px] leading-snug text-fg">
        <code className={className}>{children}</code>
      </pre>
    ) : (
      <code className="break-all rounded bg-bg-elev-2 px-1 py-0.5 font-mono text-[12px] text-fg">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-medium text-fg-dim">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
};

// Memoized: when a new chunk streams in, only the still-growing block re-parses; the
// already-rendered blocks above it (same `children` string) skip re-parsing.
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-[13px] text-fg">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeUrlTransform}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
