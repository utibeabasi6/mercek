import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { MetricSeries } from "@/types";

function cssVar(name: string, fallback: string): string {
  if (typeof getComputedStyle === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function MetricChart({
  series,
  markers = [],
}: {
  series: MetricSeries;
  // Vertical deploy markers (epoch seconds) drawn over the chart.
  markers?: { ts: number; label: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const xs = series.points.map((p) => Date.parse(p.timestamp) / 1000);
    const ys = series.points.map((p) => p.value);
    const data: uPlot.AlignedData = [xs, ys];

    const accent = cssVar("--accent", "#5b9dff");
    const muted = cssVar("--fg-muted", "#6b7280");
    const grid = cssVar("--border", "#262a31");

    const opts: uPlot.Options = {
      width: el.clientWidth || 460,
      height: 150,
      padding: [10, 14, 0, 0],
      cursor: { points: { show: false } },
      legend: { show: false },
      scales: { x: { time: true } },
      axes: [
        { stroke: muted, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid }, font: "11px monospace" },
        {
          stroke: muted,
          grid: { stroke: grid, width: 1 },
          ticks: { stroke: grid },
          size: 46,
          font: "11px monospace",
        },
      ],
      series: [{}, { stroke: accent, width: 1.5, fill: `${accent}22`, points: { show: false } }],
      plugins: markers.length
        ? [
            {
              hooks: {
                // Dashed vertical line at each deploy so a metric shift lines up with it.
                draw: (u: uPlot) => {
                  const ctx = u.ctx;
                  ctx.save();
                  ctx.strokeStyle = cssVar("--warn", "#d9a23a");
                  ctx.lineWidth = 1;
                  ctx.setLineDash([3, 3]);
                  for (const m of markers) {
                    const x = Math.round(u.valToPos(m.ts, "x", true));
                    if (x < u.bbox.left || x > u.bbox.left + u.bbox.width) continue;
                    ctx.beginPath();
                    ctx.moveTo(x, u.bbox.top);
                    ctx.lineTo(x, u.bbox.top + u.bbox.height);
                    ctx.stroke();
                  }
                  ctx.restore();
                },
              },
            },
          ]
        : [],
    };

    const plot = new uPlot(opts, data, el);
    plotRef.current = plot;

    const ro = new ResizeObserver(() => {
      if (plotRef.current && el.clientWidth) {
        plotRef.current.setSize({ width: el.clientWidth, height: 150 });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, [series, markers]);

  return (
    <div className="w-full">
      <div className="mb-1 px-1 text-[11px] uppercase tracking-wide text-fg-muted">
        {series.label}
      </div>
      <div ref={ref} className="w-full" />
    </div>
  );
}
