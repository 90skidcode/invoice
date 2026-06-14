import { PriceDisplay } from '@/components/ui/price-display';
import { cn } from '@/lib/utils';
import * as React from 'react';

export function DailySalesChart({
  daily,
}: Readonly<{ daily: { date: string; grand: string }[] }>) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  if (daily.length === 0) return null;

  const numericValues = daily.map((d) => Number(d.grand));
  const maxVal = Math.max(...numericValues, 100) * 1.15;

  const width = 600;
  const height = 180;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = daily.map((d, i) => {
    const x = paddingLeft + (i / Math.max(daily.length - 1, 1)) * chartWidth;
    const y = paddingTop + chartHeight - (Number(d.grand) / maxVal) * chartHeight;
    return { x, y, date: d.date, value: Number(d.grand) };
  });

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  const linePath =
    points.length > 0 && firstPoint
      ? `M ${firstPoint.x} ${firstPoint.y} ${points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(' ')}`
      : '';

  const areaPath =
    points.length > 0 && firstPoint && lastPoint
      ? `${linePath} L ${lastPoint.x} ${paddingTop + chartHeight} L ${firstPoint.x} ${paddingTop + chartHeight} Z`
      : '';

  const gridLines = [0.25, 0.5, 0.75, 1.0].map((pct) => ({
    val: maxVal * pct,
    y: paddingTop + chartHeight - pct * chartHeight,
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Sales Trend
        </h3>
        {hoveredIdx !== null && points[hoveredIdx] && (
          <div className="text-xs font-semibold text-primary animate-fade-in">
            {points[hoveredIdx].date}: <PriceDisplay value={points[hoveredIdx].value.toFixed(2)} />
          </div>
        )}
      </div>
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <title>Daily Sales Trend Chart</title>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {gridLines.map((gl) => (
            <g key={gl.val} className="opacity-40">
              <line
                x1={paddingLeft}
                y1={gl.y}
                x2={width - paddingRight}
                y2={gl.y}
                stroke="currentColor"
                strokeDasharray="4 4"
                className="text-border"
              />
              <text
                x={paddingLeft - 8}
                y={gl.y + 4}
                className="text-[9px] fill-muted-foreground text-right font-mono"
                textAnchor="end"
              >
                ₹{gl.val >= 1000 ? `${(gl.val / 1000).toFixed(1)}k` : gl.val.toFixed(0)}
              </text>
            </g>
          ))}

          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight}
            x2={width - paddingRight}
            y2={paddingTop + chartHeight}
            stroke="currentColor"
            className="text-border"
          />

          {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {points.map((p, i) => {
            const isHovered = hoveredIdx === i;
            return (
              <g key={p.date}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isHovered ? 6 : 3}
                  className={cn(
                    'transition-all duration-150',
                    isHovered ? 'fill-primary stroke-background stroke-2' : 'fill-primary/70',
                  )}
                />
              </g>
            );
          })}

          {points
            .filter(
              (_, i) =>
                i === 0 ||
                i === points.length - 1 ||
                (points.length > 5 && i % Math.floor(points.length / 4) === 0),
            )
            .map((p) => (
              <text
                key={p.date}
                x={p.x}
                y={paddingTop + chartHeight + 16}
                className="text-[9px] fill-muted-foreground font-mono"
                textAnchor="middle"
              >
                {p.date.slice(8)}
              </text>
            ))}

          {points.map((p, i) => {
            const stepWidth = chartWidth / Math.max(daily.length - 1, 1);
            const xLeft = p.x - stepWidth / 2;
            return (
              <rect
                key={`rect-${p.date}`}
                x={xLeft}
                y={paddingTop}
                width={stepWidth}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function SalesByItemChart({
  items,
}: Readonly<{ items: { name: string; total: string }[] }>) {
  if (items.length === 0) return null;
  const topItems = [...items].slice(0, 5);
  const maxTotal = Math.max(...topItems.map((it) => Number(it.total)), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 hover:shadow-md transition-shadow duration-200">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Top 5 Items by Revenue
      </h3>
      <div className="space-y-3">
        {topItems.map((it) => {
          const widthPct = (Number(it.total) / maxTotal) * 100;
          return (
            <div key={it.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium text-foreground max-w-[250px]">
                  {it.name}
                </span>
                <span className="font-semibold text-foreground tabular-nums">
                  <PriceDisplay value={it.total} />
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary/80 rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TopStockItemsChart({
  items,
}: Readonly<{ items: { name: string; value: string }[] }>) {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5);
  const maxVal = Math.max(...sorted.map((d) => Number(d.value)), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 hover:shadow-md transition-shadow duration-200">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Top 5 Items by Stock Value
      </h3>
      <div className="space-y-3">
        {sorted.map((it) => {
          const widthPct = (Number(it.value) / maxVal) * 100;
          return (
            <div key={it.name} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate max-w-[240px] font-medium text-foreground">
                  {it.name}
                </span>
                <span className="text-muted-foreground font-semibold tabular-nums">
                  ₹{Number(it.value).toFixed(2)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary/70 rounded-full transition-all duration-300"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReceivablesAgingBar({
  aging,
  total,
}: Readonly<{ aging: Record<string, string>; total: number }>) {
  // biome-ignore lint/complexity/useLiteralKeys: Property access from index signature is forbidden under strict compiler rules
  const current = Number(aging['current'] ?? 0);
  const d1_30 = Number(aging['1_30'] ?? 0);
  const d31_60 = Number(aging['31_60'] ?? 0);
  const d90plus = Number(aging['90_plus'] ?? 0);

  const denom = total || 1;
  const pCurrent = (current / denom) * 100;
  const p1_30 = (d1_30 / denom) * 100;
  const p31_60 = (d31_60 / denom) * 100;
  const p90plus = (d90plus / denom) * 100;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 hover:shadow-md transition-shadow duration-200">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Aging Distribution
      </h3>

      <div className="flex h-5 w-full overflow-hidden rounded-full bg-muted">
        {pCurrent > 0 && (
          <div
            className="bg-emerald-500 h-full"
            style={{ width: `${pCurrent}%` }}
            title={`Current: ${pCurrent.toFixed(1)}%`}
          />
        )}
        {p1_30 > 0 && (
          <div
            className="bg-sky-500 h-full"
            style={{ width: `${p1_30}%` }}
            title={`1-30d: ${p1_30.toFixed(1)}%`}
          />
        )}
        {p31_60 > 0 && (
          <div
            className="bg-amber-500 h-full"
            style={{ width: `${p31_60}%` }}
            title={`31-60d: ${p31_60.toFixed(1)}%`}
          />
        )}
        {p90plus > 0 && (
          <div
            className="bg-rose-500 h-full"
            style={{ width: `${p90plus}%` }}
            title={`90+d: ${p90plus.toFixed(1)}%`}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-3 w-3 rounded-full bg-emerald-500" /> Current ({pCurrent.toFixed(0)}%)
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-3 w-3 rounded-full bg-sky-500" /> 1–30d ({p1_30.toFixed(0)}%)
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-3 w-3 rounded-full bg-amber-500" /> 31–60d ({p31_60.toFixed(0)}%)
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="h-3 w-3 rounded-full bg-rose-500" /> 90+d ({p90plus.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}
