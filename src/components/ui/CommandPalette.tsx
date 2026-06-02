import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useShell } from "@/app/shell";
import { useGraphs } from "@/features/discovery/api";
import { clusterTab, serviceTab, taskTab } from "@/features/discovery/tabs";
import { arnName } from "@/lib/arn";
import type { ClusterResources, Scope } from "@/types";

export interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ commands }: { commands: PaletteCommand[] }) {
  const { paletteOpen, paletteMode, closePalette, openTab } = useShell();
  const { graphs } = useGraphs();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      inputRef.current?.focus();
    }
  }, [paletteOpen, paletteMode]);

  const items = useMemo<PaletteCommand[]>(() => {
    if (paletteMode === "command") return commands;
    const out: PaletteCommand[] = [];
    // Clusters from the shallow discovery (always available).
    for (const g of graphs) {
      for (const c of g.clusters)
        out.push({
          id: `c:${c.arn}`,
          title: c.name,
          hint: `cluster · ${g.scope.profile}`,
          run: () => openTab(clusterTab(g.scope, c)),
        });
    }
    // Services/tasks from any cluster whose resources have been loaded (cached).
    const cached = qc.getQueriesData<ClusterResources>({ queryKey: ["clusterResources"] });
    for (const [key, data] of cached) {
      if (!data) continue;
      const [, profile, region] = key as [string, string, string, string];
      const scope: Scope = { profile, region };
      for (const s of data.services)
        out.push({
          id: `s:${s.arn}`,
          title: s.name,
          hint: `service · ${s.cluster}`,
          run: () => openTab(serviceTab(scope, s)),
        });
      for (const t of data.tasks)
        out.push({
          id: `t:${t.arn}`,
          title: arnName(t.arn).slice(0, 12),
          hint: `task · ${t.service ?? t.cluster}`,
          run: () => openTab(taskTab(scope, t)),
        });
    }
    return out;
  }, [paletteMode, commands, graphs, qc, openTab]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter((i) => `${i.title} ${i.hint ?? ""}`.toLowerCase().includes(q))
      : items;
    return base.slice(0, 60);
  }, [items, query]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  if (!paletteOpen) return null;

  const run = (item?: PaletteCommand) => {
    const it = item ?? filtered[index];
    if (!it) return;
    it.run();
    closePalette();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      onMouseDown={closePalette}
    >
      <div className="absolute inset-0 bg-[var(--overlay)]" />
      <div
        className="relative w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-border-strong bg-bg-elev shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={paletteMode === "command" ? "Run a command…" : "Go to resource…"}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-fg outline-none placeholder:text-fg-muted"
        />
        <div className="max-h-[50vh] overflow-auto py-1">
          {filtered.length === 0 && <div className="px-4 py-3 text-fg-muted">no matches</div>}
          {filtered.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(it)}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left ${
                i === index ? "bg-bg-elev-2 text-fg" : "text-fg-dim"
              }`}
            >
              <span className="truncate">{it.title}</span>
              {it.hint && (
                <span className="ml-auto shrink-0 text-[11px] text-fg-muted">{it.hint}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
