import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';

type Tab = 'sales' | 'gst' | 'stock' | 'receivables';

const TABS: { id: Tab; label: string }[] = [
  { id: 'sales', label: 'Sales' },
  { id: 'gst', label: 'GST (GSTR-1)' },
  { id: 'stock', label: 'Stock Valuation' },
  { id: 'receivables', label: 'Receivables' },
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

function StatCard({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SalesReport() {
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-sales', from, to],
    queryFn: () =>
      api.get<{
        totals: { count: number; taxable: string; cgst: string; sgst: string; igst: string; grand: string; collected: string };
        daily: { date: string; count: number; grand: string }[];
      }>(`/reports/sales/summary?date_from=${from}&date_to=${to}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Invoices" value={data.totals.count} />
            <StatCard label="Taxable" value={<PriceDisplay value={data.totals.taxable} />} />
            <StatCard
              label="GST"
              value={
                <PriceDisplay
                  value={(
                    Number(data.totals.cgst) +
                    Number(data.totals.sgst) +
                    Number(data.totals.igst)
                  ).toFixed(2)}
                />
              }
            />
            <StatCard label="Grand Total" value={<PriceDisplay value={data.totals.grand} />} />
          </div>
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Invoices</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-muted-foreground">
                      No sales in this period.
                    </td>
                  </tr>
                ) : (
                  data.daily.map((d) => (
                    <tr key={d.date} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{d.date}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{d.count}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <PriceDisplay value={d.grand} currency="" />
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
        hsn_summary: { hsn_code: string; gst_rate: string; taxable: string; cgst: string; sgst: string; igst: string }[];
      }>(`/reports/gst/gstr1?period=${period}`),
  });

  return (
    <div className="space-y-4">
      <label className="block w-40">
        <span className="mb-1 block text-xs text-muted-foreground">Period (YYYY-MM)</span>
        <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-05" />
      </label>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="B2B Invoices" value={data.b2b.count} />
            <StatCard label="B2C Invoices" value={data.b2c.count} />
            <StatCard label="Taxable" value={<PriceDisplay value={data.totals.taxable} />} />
            <StatCard label="Grand Total" value={<PriceDisplay value={data.totals.grand} />} />
          </div>
          <div className="rounded-lg border border-border overflow-auto">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">HSN Summary</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">HSN</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Rate</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Taxable</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">CGST</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">SGST</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">IGST</th>
                </tr>
              </thead>
              <tbody>
                {data.hsn_summary.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-muted-foreground">
                      No data for this period.
                    </td>
                  </tr>
                ) : (
                  data.hsn_summary.map((h, i) => (
                    <tr key={`${h.hsn_code}-${h.gst_rate}-${i}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono">{h.hsn_code}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{h.gst_rate}%</td>
                      <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={h.taxable} currency="" /></td>
                      <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={h.cgst} currency="" /></td>
                      <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={h.sgst} currency="" /></td>
                      <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={h.igst} currency="" /></td>
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

function StockReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-stock'],
    queryFn: () =>
      api.get<{
        total_value: string;
        items: { item_id: string; sku: string; name: string; qty: string; avg_cost: string; value: string }[];
      }>('/reports/stock/valuation'),
  });
  return (
    <div className="space-y-4">
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : data ? (
        <>
          <StatCard label="Total Stock Value" value={<PriceDisplay value={data.total_value} />} />
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Cost</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.item_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{it.sku}</td>
                    <td className="px-4 py-2">{it.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{it.qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={it.avg_cost} currency="" /></td>
                    <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={it.value} currency="" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReceivablesReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['rpt-receivables'],
    queryFn: () =>
      api.get<{
        total_receivable: string;
        aging: Record<string, string>;
        customers: { customer_id: string; name: string; balance: string }[];
      }>('/reports/financial/receivables'),
  });
  return (
    <div className="space-y-4">
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Total Due" value={<PriceDisplay value={data.total_receivable} />} />
            <StatCard label="Current" value={<PriceDisplay value={data.aging['current'] ?? '0'} currency="" />} />
            <StatCard label="1–30d" value={<PriceDisplay value={data.aging['1_30'] ?? '0'} currency="" />} />
            <StatCard label="31–60d" value={<PriceDisplay value={data.aging['31_60'] ?? '0'} currency="" />} />
            <StatCard label="90+ d" value={<PriceDisplay value={data.aging['90_plus'] ?? '0'} currency="" />} />
          </div>
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-6 text-center text-muted-foreground">
                      No outstanding receivables.
                    </td>
                  </tr>
                ) : (
                  data.customers.map((c) => (
                    <tr key={c.customer_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{c.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={c.balance} currency="" /></td>
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

export function ReportsPage() {
  const [tab, setTab] = React.useState<Tab>('sales');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Reports</h1>
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'sales' && <SalesReport />}
      {tab === 'gst' && <GstReport />}
      {tab === 'stock' && <StockReport />}
      {tab === 'receivables' && <ReceivablesReport />}
    </div>
  );
}
