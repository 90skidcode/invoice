import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Boxes,
  DollarSign,
  Download,
  FileSpreadsheet,
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import * as React from 'react';

type Tab = 'sales' | 'purchases' | 'gst' | 'stock' | 'receivables';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'sales', label: 'Sales Report', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'purchases', label: 'Purchase Report', icon: <ShoppingCart className="h-4 w-4" /> },
  { id: 'gst', label: 'GST (GSTR-1)', icon: <Receipt className="h-4 w-4" /> },
  { id: 'stock', label: 'Stock & Inventory', icon: <Boxes className="h-4 w-4" /> },
  { id: 'receivables', label: 'Financial Aging', icon: <Users className="h-4 w-4" /> },
];

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function StatCard({
  label,
  value,
  icon,
  className,
}: Readonly<{
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow duration-200',
        className,
      )}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        </div>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
    </div>
  );
}

function SubTabToggle<T extends string>({
  options,
  active,
  onChange,
}: Readonly<{
  options: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}>) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1 border border-border">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-semibold transition-all duration-200',
            active === opt.id
              ? 'bg-background text-foreground shadow-sm border border-border/10'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DailySalesChart({ daily }: Readonly<{ daily: { date: string; grand: string }[] }>) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  if (daily.length === 0) return null;

  const numericValues = daily.map((d) => Number(d.grand));
  const maxVal = Math.max(...numericValues, 100) * 1.15; // 15% padding

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

  // Generate grid values
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

          {/* Grid lines */}
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

          {/* X axis line */}
          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight}
            x2={width - paddingRight}
            y2={paddingTop + chartHeight}
            stroke="currentColor"
            className="text-border"
          />

          {/* Area under the line */}
          {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

          {/* Line chart */}
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

          {/* Interactive dots & hover circles */}
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

          {/* X-axis labels */}
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

          {/* Interactive overlay rects for simple hover trigger */}
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

function SalesByItemChart({ items }: Readonly<{ items: { name: string; total: string }[] }>) {
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

function SalesReport() {
  const [subTab, setSubTab] = React.useState<'summary' | 'items' | 'soaps' | 'referrals'>(
    'summary',
  );
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());

  // Query for summary
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['rpt-sales', from, to],
    queryFn: () =>
      api.get<{
        totals: {
          count: number;
          taxable: string;
          cgst: string;
          sgst: string;
          igst: string;
          grand: string;
          collected: string;
        };
        daily: { date: string; count: number; grand: string }[];
      }>(`/reports/sales/summary?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'summary',
  });

  // Query for items
  const { data: itemsData, isLoading: isItemsLoading } = useQuery({
    queryKey: ['rpt-sales-items', from, to],
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        items: { item_id: string; name: string; qty: string; taxable: string; total: string }[];
      }>(`/reports/sales/by-item?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'items',
  });

  // Query for soaps
  const { data: soapsData, isLoading: isSoapsLoading } = useQuery({
    queryKey: ['rpt-sales-soaps', from, to],
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        customers: { customer_id: string | null; name: string; qty: string; total: string }[];
      }>(`/reports/sales/soaps-by-customer?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'soaps',
  });

  // Query for referrals
  const { data: referralsData, isLoading: isReferralsLoading } = useQuery({
    queryKey: ['rpt-sales-referrals', from, to],
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        referrals: {
          referred_by_id: string;
          referrer_name: string;
          count: number;
          total: string;
        }[];
      }>(`/reports/sales/by-referral?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'referrals',
  });

  const downloadSummaryCSV = () => {
    if (!summaryData || !summaryData.daily.length) return;
    const headers = 'Date,Invoices,Total Amount\n';
    const rows = summaryData.daily.map((d) => `${d.date},${d.count},${d.grand}`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-summary-${from}-to-${to}.csv`);
    link.click();
  };

  const downloadItemsCSV = () => {
    if (!itemsData || !itemsData.items.length) return;
    const headers = 'Item Name,Qty Sold,Taxable Amount,Total Amount\n';
    const rows = itemsData.items
      .map((it) => `"${it.name.replace(/"/g, '""')}",${it.qty},${it.taxable},${it.total}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-by-item-${from}-to-${to}.csv`);
    link.click();
  };

  const downloadSoapsCSV = () => {
    if (!soapsData || !soapsData.customers.length) return;
    const headers = 'Customer Name,Soaps Purchased,Total Spent\n';
    const rows = soapsData.customers
      .map((c) => `"${c.name.replace(/"/g, '""')}",${c.qty},${c.total}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `soaps-by-customer-${from}-to-${to}.csv`);
    link.click();
  };

  const downloadReferralsCSV = () => {
    if (!referralsData || !referralsData.referrals.length) return;
    const headers = 'Referrer Name,Invoices Count,Total Referred Amount\n';
    const rows = referralsData.referrals
      .map((r) => `"${r.referrer_name.replace(/"/g, '""')}",${r.count},${r.total}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `sales-by-referral-${from}-to-${to}.csv`);
    link.click();
  };

  const isLoading =
    subTab === 'summary'
      ? isSummaryLoading
      : subTab === 'items'
        ? isItemsLoading
        : subTab === 'soaps'
          ? isSoapsLoading
          : isReferralsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="sales-from-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">From</span>
            <Input
              id="sales-from-date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label htmlFor="sales-to-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">To</span>
            <Input
              id="sales-to-date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div className="pb-0.5">
            <SubTabToggle
              options={[
                { id: 'summary', label: 'Summary' },
                { id: 'items', label: 'Sales by Item' },
                { id: 'soaps', label: 'Soaps by Customer' },
                { id: 'referrals', label: 'By Referral' },
              ]}
              active={subTab}
              onChange={setSubTab}
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            (subTab === 'summary' && !summaryData?.daily.length) ||
            (subTab === 'items' && !itemsData?.items.length) ||
            (subTab === 'soaps' && !soapsData?.customers.length) ||
            (subTab === 'referrals' && !referralsData?.referrals.length)
          }
          iconLeft={<Download className="h-4 w-4" />}
          onClick={
            subTab === 'summary'
              ? downloadSummaryCSV
              : subTab === 'items'
                ? downloadItemsCSV
                : subTab === 'soaps'
                  ? downloadSoapsCSV
                  : downloadReferralsCSV
          }
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subTab === 'summary' && summaryData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Invoices"
              value={summaryData.totals.count}
              icon={<FileSpreadsheet className="h-4 w-4" />}
            />
            <StatCard
              label="Taxable Amount"
              value={<PriceDisplay value={summaryData.totals.taxable} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="GST (CGST+SGST+IGST)"
              icon={<Receipt className="h-4 w-4" />}
              value={
                <PriceDisplay
                  value={(
                    Number(summaryData.totals.cgst) +
                    Number(summaryData.totals.sgst) +
                    Number(summaryData.totals.igst)
                  ).toFixed(2)}
                />
              }
            />
            <StatCard
              label="Grand Total"
              value={<PriceDisplay value={summaryData.totals.grand} />}
              icon={<TrendingUp className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>

          <DailySalesChart daily={summaryData.daily} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Invoices</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.daily.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      No sales in this period.
                    </td>
                  </tr>
                ) : (
                  summaryData.daily.map((d) => (
                    <tr
                      key={d.date}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{d.date}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={d.grand} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'items' && itemsData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label="Unique Items Sold"
              value={itemsData.items.length}
              icon={<Boxes className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20 flex flex-col justify-center"
            />
            <SalesByItemChart items={itemsData.items} />
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3 text-right">Qty Sold</th>
                  <th className="px-4 py-3 text-right">Taxable Amt</th>
                  <th className="px-4 py-3 text-right">Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {itemsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      No items sold in this period.
                    </td>
                  </tr>
                ) : (
                  itemsData.items.map((it) => (
                    <tr
                      key={it.item_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{it.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={it.taxable} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={it.total} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'soaps' && soapsData ? (
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3 text-right">Soaps Purchased</th>
                  <th className="px-4 py-3 text-right">Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {soapsData.customers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      No soaps purchased in this period.
                    </td>
                  </tr>
                ) : (
                  soapsData.customers.map((c, idx) => (
                    <tr
                      key={c.customer_id ?? `walk-in-${idx}`}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={c.total} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'referrals' && referralsData ? (
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Referrer Name</th>
                  <th className="px-4 py-3 text-right">Invoices Count</th>
                  <th className="px-4 py-3 text-right">Total Referred Amount</th>
                </tr>
              </thead>
              <tbody>
                {referralsData.referrals.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      No referred sales in this period.
                    </td>
                  </tr>
                ) : (
                  referralsData.referrals.map((r) => (
                    <tr
                      key={r.referred_by_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{r.referrer_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={r.total} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function GstReport() {
  const [period, setPeriod] = React.useState(currentPeriod());
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-gst', period],
    queryFn: () =>
      api.get<{
        b2b: { count: number; taxable: string; tax: string };
        b2c: { count: number; taxable: string; tax: string };
        totals: { taxable: string; cgst: string; sgst: string; igst: string; grand: string };
        hsn_summary: {
          hsn_code: string;
          gst_rate: string;
          taxable: string;
          cgst: string;
          sgst: string;
          igst: string;
        }[];
      }>(`/reports/gst/gstr1?period=${period}`),
  });

  const downloadCSV = () => {
    if (!data || !data.hsn_summary.length) return;
    const headers = 'HSN,Rate,Taxable,CGST,SGST,IGST\n';
    const rows = data.hsn_summary
      .map((h) => `${h.hsn_code},${h.gst_rate},${h.taxable},${h.cgst},${h.sgst},${h.igst}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gst-report-${period}.csv`);
    link.click();
  };

  const b2bTaxable = data ? Number(data.b2b.taxable) : 0;
  const b2cTaxable = data ? Number(data.b2c.taxable) : 0;
  const totalTaxable = b2bTaxable + b2cTaxable || 1;
  const pctB2B = (b2bTaxable / totalTaxable) * 100;
  const pctB2C = (b2cTaxable / totalTaxable) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor="gst-period" className="block w-40">
          <span className="mb-1 block text-xs text-muted-foreground font-medium">
            Period (YYYY-MM)
          </span>
          <Input
            id="gst-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-05"
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={!data || data.hsn_summary.length === 0}
          iconLeft={<Download className="h-4 w-4" />}
          onClick={downloadCSV}
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="B2B Invoices"
              value={data.b2b.count}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="B2C Invoices"
              value={data.b2c.count}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Taxable Amount"
              value={<PriceDisplay value={data.totals.taxable} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="Grand Total"
              value={<PriceDisplay value={data.totals.grand} />}
              icon={<TrendingUp className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>

          {/* B2B vs B2C Split visualizer */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:shadow-md transition-shadow duration-200">
            <div className="flex justify-between items-center text-xs font-semibold uppercase text-muted-foreground">
              <span>B2B Sales ({pctB2B.toFixed(0)}%)</span>
              <span>B2C Sales ({pctB2C.toFixed(0)}%)</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {pctB2B > 0 && (
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${pctB2B}%` }}
                />
              )}
              {pctB2C > 0 && (
                <div
                  className="bg-sky-400 h-full transition-all duration-500"
                  style={{ width: `${pctB2C}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />{' '}
                <PriceDisplay value={data.b2b.taxable} /> ({data.b2b.count} invs)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />{' '}
                <PriceDisplay value={data.b2c.taxable} /> ({data.b2c.count} invs)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
              HSN Summary
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">HSN</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-right">Taxable</th>
                  <th className="px-4 py-3 text-right">CGST</th>
                  <th className="px-4 py-3 text-right">SGST</th>
                  <th className="px-4 py-3 text-right">IGST</th>
                </tr>
              </thead>
              <tbody>
                {data.hsn_summary.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  data.hsn_summary.map((h, i) => (
                    <tr
                      key={`${h.hsn_code}-${h.gst_rate}-${i}`}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {!h.hsn_code || h.hsn_code === 'NA' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-500 border border-amber-500/20">
                            <AlertTriangle className="h-3 w-3" /> Missing HSN
                          </span>
                        ) : (
                          <span className="font-mono">{h.hsn_code}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{h.gst_rate}%</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={h.taxable} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={h.cgst} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={h.sgst} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={h.igst} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function TopStockItemsChart({ items }: Readonly<{ items: { name: string; value: string }[] }>) {
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

function StockReport() {
  const [subTab, setSubTab] = React.useState<'valuation' | 'low'>('valuation');

  // Valuation Query
  const { data: valData, isLoading: isValLoading } = useQuery({
    queryKey: ['rpt-stock-valuation'],
    queryFn: () =>
      api.get<{
        total_value: string;
        total_sale_value: string;
        items: {
          item_id: string;
          sku: string;
          name: string;
          qty: string;
          avg_cost: string;
          value: string;
          sale_price: string;
          sale_value: string;
        }[];
      }>('/reports/stock/valuation'),
    enabled: subTab === 'valuation',
  });

  // Low Stock Query
  const { data: lowData, isLoading: isLowLoading } = useQuery({
    queryKey: ['rpt-stock-low'],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          sku: string;
          name: string;
          current_stock: string;
          reorder_level: string;
          reorder_qty: string;
        }[];
      }>('/reports/stock/low'),
    enabled: subTab === 'low',
  });

  const downloadValuationCSV = () => {
    if (!valData || !valData.items.length) return;
    const headers = 'SKU,Item Name,Qty,Avg Cost,Valuation,Selling Price,Selling Value\n';
    const rows = valData.items
      .map(
        (it) =>
          `"${it.sku}","${it.name.replace(/"/g, '""')}",${it.qty},${it.avg_cost},${it.value},${it.sale_price},${it.sale_value}`,
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'stock-valuation-report.csv');
    link.click();
  };

  const downloadLowStockCSV = () => {
    if (!lowData || !lowData.items.length) return;
    const headers = 'SKU,Item Name,Current Stock,Reorder Level,Reorder Qty\n';
    const rows = lowData.items
      .map(
        (it) =>
          `"${it.sku}","${it.name.replace(/"/g, '""')}",${it.current_stock},${it.reorder_level},${it.reorder_qty}`,
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'low-stock-report.csv');
    link.click();
  };

  const isLoading = subTab === 'valuation' ? isValLoading : isLowLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SubTabToggle
          options={[
            { id: 'valuation', label: 'Stock Valuation' },
            { id: 'low', label: 'Low Stock Alerts' },
          ]}
          active={subTab}
          onChange={setSubTab}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            (subTab === 'valuation' && !valData?.items.length) ||
            (subTab === 'low' && !lowData?.items.length)
          }
          iconLeft={<Download className="h-4 w-4" />}
          onClick={subTab === 'valuation' ? downloadValuationCSV : downloadLowStockCSV}
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subTab === 'valuation' && valData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid grid-cols-1 gap-4">
              <StatCard
                label="Total Stock Value (Cost)"
                value={<PriceDisplay value={valData.total_value} />}
                icon={<Boxes className="h-4 w-4" />}
                className="bg-primary/5 border-primary/20 flex flex-col justify-center"
              />
              <StatCard
                label="Total Selling Value"
                value={<PriceDisplay value={valData.total_sale_value} />}
                icon={<DollarSign className="h-4 w-4" />}
                className="bg-emerald-500/5 border-emerald-500/20 flex flex-col justify-center"
              />
            </div>
            <TopStockItemsChart items={valData.items} />
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Avg Cost</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right">Selling Price</th>
                  <th className="px-4 py-3 text-right">Selling Value</th>
                </tr>
              </thead>
              <tbody>
                {valData.items.map((it) => (
                  <tr
                    key={it.item_id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{it.sku}</td>
                    <td className="px-4 py-3 font-medium">{it.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{it.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <PriceDisplay value={it.avg_cost} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={it.value} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <PriceDisplay value={it.sale_price} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600">
                      <PriceDisplay value={it.sale_value} currency="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'low' && lowData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label="Items Below Reorder Level"
              value={lowData.items.length}
              icon={<AlertTriangle className="h-4 w-4" />}
              className={cn(
                'flex flex-col justify-center',
                lowData.items.length > 0
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'bg-primary/5 border-primary/20',
              )}
            />
            {lowData.items.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 flex items-center gap-3 text-sm text-amber-800">
                <AlertTriangle className="h-8 w-8 text-amber-600 flex-shrink-0" />
                <div>
                  <span className="font-semibold">Reorder required!</span> There are{' '}
                  <span className="font-semibold">{lowData.items.length}</span> items running below
                  their safe reorder quantities.
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right">Current Stock</th>
                  <th className="px-4 py-3 text-right">Reorder Level</th>
                  <th className="px-4 py-3 text-right">Reorder Qty</th>
                </tr>
              </thead>
              <tbody>
                {lowData.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No items below reorder levels. All stock levels are safe!
                    </td>
                  </tr>
                ) : (
                  lowData.items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {it.sku}
                      </td>
                      <td className="px-4 py-3 font-medium">{it.name}</td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600 tabular-nums">
                        {it.current_stock}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.reorder_level}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.reorder_qty}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReceivablesAgingBar({
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

      {/* Progress Bar */}
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

      {/* Legend */}
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

function ReceivablesReport() {
  const [subTab, setSubTab] = React.useState<'receivables' | 'payables'>('receivables');

  // Receivables Query
  const { data: recData, isLoading: isRecLoading } = useQuery({
    queryKey: ['rpt-receivables'],
    queryFn: () =>
      api.get<{
        total_receivable: string;
        aging: Record<string, string>;
        customers: { customer_id: string; name: string; balance: string }[];
      }>('/reports/financial/receivables'),
    enabled: subTab === 'receivables',
  });

  // Payables Query
  const { data: payData, isLoading: isPayLoading } = useQuery({
    queryKey: ['rpt-payables'],
    queryFn: () =>
      api.get<{
        total_payable: string;
        vendors: { vendor_id: string; name: string; balance: string }[];
      }>('/reports/financial/payables'),
    enabled: subTab === 'payables',
  });

  const downloadReceivablesCSV = () => {
    if (!recData || !recData.customers.length) return;
    const headers = 'Customer Name,Outstanding Balance\n';
    const rows = recData.customers
      .map((c) => `"${c.name.replace(/"/g, '""')}",${c.balance}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'receivables-report.csv');
    link.click();
  };

  const downloadPayablesCSV = () => {
    if (!payData || !payData.vendors.length) return;
    const headers = 'Vendor Name,Outstanding Balance\n';
    const rows = payData.vendors
      .map((v) => `"${v.name.replace(/"/g, '""')}",${v.balance}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'payables-report.csv');
    link.click();
  };

  const isLoading = subTab === 'receivables' ? isRecLoading : isPayLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SubTabToggle
          options={[
            { id: 'receivables', label: 'Customer Receivables' },
            { id: 'payables', label: 'Vendor Payables' },
          ]}
          active={subTab}
          onChange={setSubTab}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            (subTab === 'receivables' && !recData?.customers.length) ||
            (subTab === 'payables' && !payData?.vendors.length)
          }
          iconLeft={<Download className="h-4 w-4" />}
          onClick={subTab === 'receivables' ? downloadReceivablesCSV : downloadPayablesCSV}
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subTab === 'receivables' && recData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Total Outstanding"
              value={<PriceDisplay value={recData.total_receivable} />}
              icon={<Users className="h-4 w-4" />}
              className="col-span-2 sm:col-span-1 bg-primary/5 border-primary/20"
            />
            <StatCard
              label="Current Due"
              // biome-ignore lint/complexity/useLiteralKeys: Property access from index signature is forbidden under strict compiler rules
              value={<PriceDisplay value={recData.aging['current'] ?? '0'} currency="" />}
            />
            <StatCard
              label="1–30 Days Overdue"
              value={<PriceDisplay value={recData.aging['1_30'] ?? '0'} currency="" />}
            />
            <StatCard
              label="31–60 Days Overdue"
              value={<PriceDisplay value={recData.aging['31_60'] ?? '0'} currency="" />}
            />
            <StatCard
              label="90+ Days Overdue"
              value={<PriceDisplay value={recData.aging['90_plus'] ?? '0'} currency="" />}
              className="border-rose-200 bg-rose-50/50"
            />
          </div>

          <ReceivablesAgingBar aging={recData.aging} total={Number(recData.total_receivable)} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30 font-medium">
              Outstanding Balances by Customer
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {recData.customers.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-muted-foreground">
                      No outstanding receivables.
                    </td>
                  </tr>
                ) : (
                  recData.customers.map((c) => (
                    <tr
                      key={c.customer_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={c.balance} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'payables' && payData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              label="Total Vendor Payables"
              value={<PriceDisplay value={payData.total_payable} />}
              icon={<Users className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20 flex flex-col justify-center"
            />
            <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 text-sm text-muted-foreground">
              <Boxes className="h-8 w-8 text-muted-foreground flex-shrink-0" />
              <div>
                This summary shows total unpaid purchase invoices grouped by vendor. Keep track of
                aging payables to maintain healthy supplier relationships.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30 font-medium">
              Outstanding Balances by Vendor
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {payData.vendors.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-muted-foreground">
                      No outstanding vendor payables.
                    </td>
                  </tr>
                ) : (
                  payData.vendors.map((v) => (
                    <tr
                      key={v.vendor_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={v.balance} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function PurchaseReport() {
  const [subTab, setSubTab] = React.useState<'summary' | 'vendors' | 'items'>('summary');
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());

  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['rpt-pur', from, to],
    queryFn: () =>
      api.get<{
        totals: {
          count: number;
          taxable: string;
          cgst: string;
          sgst: string;
          igst: string;
          grand: string;
          paid: string;
        };
        daily: { date: string; count: number; grand: string }[];
      }>(`/reports/purchases/summary?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'summary',
  });

  const { data: vendorsData, isLoading: isVendorsLoading } = useQuery({
    queryKey: ['rpt-pur-vendors', from, to],
    queryFn: () =>
      api.get<{
        vendors: {
          vendor_id: string | null;
          name: string;
          count: number;
          taxable: string;
          total: string;
        }[];
      }>(`/reports/purchases/by-vendor?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'vendors',
  });

  const { data: itemsData, isLoading: isItemsLoading } = useQuery({
    queryKey: ['rpt-pur-items', from, to],
    queryFn: () =>
      api.get<{
        items: { item_id: string; name: string; qty: string; taxable: string; total: string }[];
      }>(`/reports/purchases/by-item?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'items',
  });

  const downloadSummaryCSV = () => {
    if (!summaryData || !summaryData.daily.length) return;
    const headers = 'Date,Purchases,Total Amount\n';
    const rows = summaryData.daily.map((d) => `${d.date},${d.count},${d.grand}`).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `purchase-summary-${from}-to-${to}.csv`);
    link.click();
  };

  const downloadVendorsCSV = () => {
    if (!vendorsData || !vendorsData.vendors.length) return;
    const headers = 'Vendor Name,Bills,Taxable Amount,Total Amount\n';
    const rows = vendorsData.vendors
      .map((v) => `"${v.name.replace(/"/g, '""')}",${v.count},${v.taxable},${v.total}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `purchases-by-vendor-${from}-to-${to}.csv`);
    link.click();
  };

  const downloadItemsCSV = () => {
    if (!itemsData || !itemsData.items.length) return;
    const headers = 'Item Name,Qty Purchased,Taxable Amount,Total Amount\n';
    const rows = itemsData.items
      .map((it) => `"${it.name.replace(/"/g, '""')}",${it.qty},${it.taxable},${it.total}`)
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `purchases-by-item-${from}-to-${to}.csv`);
    link.click();
  };

  const isLoading =
    subTab === 'summary'
      ? isSummaryLoading
      : subTab === 'vendors'
        ? isVendorsLoading
        : isItemsLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="pur-from-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">From</span>
            <Input
              id="pur-from-date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label htmlFor="pur-to-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">To</span>
            <Input
              id="pur-to-date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div className="pb-0.5">
            <SubTabToggle
              options={[
                { id: 'summary', label: 'Summary' },
                { id: 'vendors', label: 'By Vendor' },
                { id: 'items', label: 'By Item' },
              ]}
              active={subTab}
              onChange={setSubTab}
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={
            isLoading ||
            (subTab === 'summary' && !summaryData?.daily.length) ||
            (subTab === 'vendors' && !vendorsData?.vendors.length) ||
            (subTab === 'items' && !itemsData?.items.length)
          }
          iconLeft={<Download className="h-4 w-4" />}
          onClick={
            subTab === 'summary'
              ? downloadSummaryCSV
              : subTab === 'vendors'
                ? downloadVendorsCSV
                : downloadItemsCSV
          }
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subTab === 'summary' && summaryData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Purchase Bills"
              value={summaryData.totals.count}
              icon={<FileSpreadsheet className="h-4 w-4" />}
            />
            <StatCard
              label="Taxable Amount"
              value={<PriceDisplay value={summaryData.totals.taxable} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="GST (CGST+SGST+IGST)"
              icon={<Receipt className="h-4 w-4" />}
              value={
                <PriceDisplay
                  value={(
                    Number(summaryData.totals.cgst) +
                    Number(summaryData.totals.sgst) +
                    Number(summaryData.totals.igst)
                  ).toFixed(2)}
                />
              }
            />
            <StatCard
              label="Grand Total"
              value={<PriceDisplay value={summaryData.totals.grand} />}
              icon={<ShoppingCart className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>

          <DailySalesChart daily={summaryData.daily} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Bills</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.daily.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      No purchases in this period.
                    </td>
                  </tr>
                ) : (
                  summaryData.daily.map((d) => (
                    <tr
                      key={d.date}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{d.date}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={d.grand} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'vendors' && vendorsData ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">Vendor Name</th>
                <th className="px-4 py-3 text-right">Bills</th>
                <th className="px-4 py-3 text-right">Taxable Amt</th>
                <th className="px-4 py-3 text-right">Total Purchases</th>
              </tr>
            </thead>
            <tbody>
              {vendorsData.vendors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No purchases in this period.
                  </td>
                </tr>
              ) : (
                vendorsData.vendors.map((v, idx) => (
                  <tr
                    key={v.vendor_id ?? `unknown-${idx}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{v.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{v.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <PriceDisplay value={v.taxable} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={v.total} currency="" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : subTab === 'items' && itemsData ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">Item Name</th>
                <th className="px-4 py-3 text-right">Qty Purchased</th>
                <th className="px-4 py-3 text-right">Taxable Amt</th>
                <th className="px-4 py-3 text-right">Total Purchases</th>
              </tr>
            </thead>
            <tbody>
              {itemsData.items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No items purchased in this period.
                  </td>
                </tr>
              ) : (
                itemsData.items.map((it) => (
                  <tr
                    key={it.item_id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{it.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{it.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <PriceDisplay value={it.taxable} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={it.total} currency="" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = React.useState<Tab>('sales');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all duration-200 whitespace-nowrap',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-2">
        {tab === 'sales' && <SalesReport />}
        {tab === 'purchases' && <PurchaseReport />}
        {tab === 'gst' && <GstReport />}
        {tab === 'stock' && <StockReport />}
        {tab === 'receivables' && <ReceivablesReport />}
      </div>
    </div>
  );
}
