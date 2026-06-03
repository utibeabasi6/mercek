import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Render agent output as markdown with theme-consistent styling. react-markdown
// ignores raw HTML by default, so this is safe for (untrusted) LLM text — no
// dangerouslySetInnerHTML. GFM adds tables, strikethrough, task lists, autolinks.
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

export function Markdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 text-[13px] text-fg">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
