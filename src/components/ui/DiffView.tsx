// Minimal JSON diff: shows the new document with added lines highlighted, plus
// the lines that were removed. Good enough for the small task-def edit subset.
export function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const beforeText = JSON.stringify(before, null, 2);
  const afterText = JSON.stringify(after, null, 2);
  const beforeLines = beforeText.split("\n");
  const afterLines = afterText.split("\n");
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const removed = beforeLines.filter((l) => !afterSet.has(l));
  const unchanged = beforeText === afterText;

  return (
    <div className="max-h-72 overflow-auto rounded border border-border bg-bg p-2 text-[12px] leading-relaxed">
      {unchanged ? (
        <div className="text-fg-muted">no changes</div>
      ) : (
        <>
          <pre className="whitespace-pre-wrap break-all">
            {afterLines.map((l, i) => (
              <div key={`a${i}`} className={beforeSet.has(l) ? "text-fg-dim" : "text-ok"}>
                {beforeSet.has(l) ? "  " : "+ "}
                {l}
              </div>
            ))}
          </pre>
          {removed.length > 0 && (
            <pre className="mt-2 whitespace-pre-wrap break-all border-t border-border pt-2">
              <div className="text-[11px] uppercase text-fg-muted">removed</div>
              {removed.map((l, i) => (
                <div key={`r${i}`} className="text-err">
                  - {l.trim()}
                </div>
              ))}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
