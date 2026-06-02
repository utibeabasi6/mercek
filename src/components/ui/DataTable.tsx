import { useEffect, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";

function usePersistedVisibility(key?: string) {
  const storageKey = key ? `mercek.cols.${key}` : null;
  const [vis, setVis] = useState<VisibilityState>(() => {
    if (!storageKey) return {};
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? "{}") as VisibilityState;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(vis));
  }, [storageKey, vis]);
  return [vis, setVis] as const;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function DataTable<T>({
  data,
  columns,
  persistKey,
  onRowClick,
  getRowId,
  exportName = "export",
  filterPlaceholder = "filter…",
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  persistKey?: string;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  exportName?: string;
  filterPlaceholder?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = usePersistedVisibility(persistKey);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  useEffect(() => {
    if (!colsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colsOpen]);

  const exportCsv = () => {
    const cols = table.getVisibleLeafColumns();
    const header = cols.map((c) => csvCell(String(c.columnDef.header ?? c.id)));
    const lines = table.getFilteredRowModel().rows.map((r) =>
      cols.map((c) => csvCell(String(r.getValue(c.id) ?? ""))),
    );
    const csv = [header, ...lines].map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 29,
    overscan: 14,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;
  const colSpan = table.getVisibleLeafColumns().length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 pb-2">
        <input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={filterPlaceholder}
          className="w-56 rounded border border-border bg-bg-elev-2 px-2 py-1 text-fg outline-none focus:border-accent"
        />
        <span className="text-[11px] text-fg-muted">{rows.length}</span>
        <div className="relative ml-auto" ref={colsRef}>
          <button
            type="button"
            onClick={() => setColsOpen((o) => !o)}
            className="rounded border border-border px-2 py-1 text-fg-dim hover:text-fg"
          >
            columns ▾
          </button>
          {colsOpen && (
            <div className="absolute right-0 z-10 mt-1 w-48 rounded border border-border-strong bg-bg-elev py-1 shadow-2xl">
              {table.getAllLeafColumns().map((col) => (
                <label
                  key={col.id}
                  className="flex cursor-pointer items-center gap-2 px-2 py-1 text-fg-dim hover:bg-bg-elev-2"
                >
                  <input
                    type="checkbox"
                    checked={col.getIsVisible()}
                    onChange={col.getToggleVisibilityHandler()}
                  />
                  {String(col.columnDef.header ?? col.id)}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded border border-border px-2 py-1 text-fg-dim hover:text-fg"
        >
          export
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-[1] bg-bg">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border text-[11px] uppercase text-fg-muted">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={`py-1 pr-3 font-normal ${
                        h.column.getCanSort() ? "cursor-pointer select-none hover:text-fg-dim" : ""
                      }`}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : ""}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td colSpan={colSpan} style={{ height: paddingTop }} />
              </tr>
            )}
            {virtualRows.map((vi) => {
              const row = rows[vi.index];
              return (
                <tr
                  key={row.id}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={`border-t border-border ${
                    onRowClick ? "cursor-pointer hover:bg-bg-elev" : ""
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="py-1 pr-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={colSpan} style={{ height: paddingBottom }} />
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td className="py-2 text-fg-muted" colSpan={colSpan}>
                  no rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
