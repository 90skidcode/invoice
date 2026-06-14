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
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { ReceivablesAgingBar } from './charts';
import { StatCard, SubTabToggle, firstOfMonth, today } from './shared';

type FinSubTab =
  | 'receivables'
  | 'payables'
  | 'payment_collection'
  | 'customer_ledger'
  | 'ap_aging'
  | 'outstanding'
  | 'pl';

const MODE_COLORS: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-700',
  upi: 'bg-violet-100 text-violet-700',
  card: 'bg-sky-100 text-sky-700',
  wallet: 'bg-amber-100 text-amber-700',
  cheque: 'bg-orange-100 text-orange-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
};

export default function ReceivablesReport() {
  const [subTab, setSubTab] = React.useState<FinSubTab>('receivables');
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());

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

  const { data: payData, isLoading: isPayLoading } = useQuery({
    queryKey: ['rpt-payables'],
    queryFn: () =>
      api.get<{
        total_payable: string;
        vendors: { vendor_id: string; name: string; balance: string }[];
      }>('/reports/financial/payables'),
    enabled: subTab === 'payables',
  });

  const { data: collData, isLoading: isCollLoading } = useQuery({
    queryKey: ['rpt-payment-collection', from, to],
    queryFn: () =>
      api.get<{
        grand_total: string;
        by_mode: { mode: string; count: number; total: string }[];
        daily: { date: string; mode: string; total: string }[];
      }>(`/reports/financial/payment-collection?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'payment_collection',
  });

  const { data: custLedgerData, isLoading: isCustLedgerLoading } = useQuery({
    queryKey: ['rpt-customer-ledger', from, to],
    queryFn: () =>
      api.get<{
        customers: {
          customer_id: string | null;
          name: string;
          invoice_count: number;
          total_billed: string;
          total_paid: string;
          balance: string;
          last_purchase: string;
        }[];
      }>(`/reports/financial/customer-ledger?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'customer_ledger',
  });

  const { data: apAgingData, isLoading: isApAgingLoading } = useQuery({
    queryKey: ['rpt-fin-ap-aging'],
    queryFn: () =>
      api.get<{
        as_of: string;
        vendors: {
          vendor_id: string | null;
          vendor_name: string;
          total_due: string;
          current_amt: string;
          d1_30: string;
          d31_60: string;
          d61_90: string;
          d90_plus: string;
        }[];
        totals: {
          total_due: string;
          current_amt: string;
          d1_30: string;
          d31_60: string;
          d61_90: string;
          d90_plus: string;
        };
      }>('/reports/financial/ap-aging'),
    enabled: subTab === 'ap_aging',
  });

  const { data: outstandingData, isLoading: isOutstandingLoading } = useQuery({
    queryKey: ['rpt-fin-outstanding'],
    queryFn: () =>
      api.get<{
        as_of: string;
        total_outstanding: string;
        overdue_count: number;
        overdue_amount: string;
        invoices: {
          id: string;
          invoice_no: string;
          invoice_date: string;
          customer_name: string;
          grand_total: string;
          amount_paid: string;
          balance_due: string;
          due_date: string | null;
          payment_status: string;
          days_overdue: number;
        }[];
      }>('/reports/financial/outstanding'),
    enabled: subTab === 'outstanding',
  });

  const { data: plData, isLoading: isPlLoading } = useQuery({
    queryKey: ['rpt-fin-pl', from, to],
    queryFn: () =>
      api.get<{
        monthly: {
          month: string;
          revenue: string;
          returns: string;
          purchases: string;
          net_revenue: string;
          gross_profit: string;
        }[];
        totals: {
          revenue: string;
          returns: string;
          purchases: string;
          net_revenue: string;
          gross_profit: string;
          gross_margin_pct: string;
        };
      }>(`/reports/financial/pl?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'pl',
  });

  const collectionPivot = React.useMemo(() => {
    if (!collData?.daily.length)
      return { modes: [] as string[], rows: [] as { date: string; totals: Record<string, string> }[] };
    const modes = [...new Set(collData.daily.map((d) => d.mode))];
    const dateMap = new Map<string, Record<string, string>>();
    for (const d of collData.daily) {
      const row = dateMap.get(d.date) ?? {};
      row[d.mode] = d.total;
      dateMap.set(d.date, row);
    }
    const rows = Array.from(dateMap.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, totals]) => ({ date, totals }));
    return { modes, rows };
  }, [collData]);

  const isLoading =
    subTab === 'receivables'
      ? isRecLoading
      : subTab === 'payables'
        ? isPayLoading
        : subTab === 'payment_collection'
          ? isCollLoading
          : subTab === 'customer_ledger'
            ? isCustLedgerLoading
            : subTab === 'ap_aging'
              ? isApAgingLoading
              : subTab === 'outstanding'
                ? isOutstandingLoading
                : isPlLoading;

  const exportDisabled =
    isLoading ||
    (subTab === 'receivables' && !recData?.customers.length) ||
    (subTab === 'payables' && !payData?.vendors.length) ||
    (subTab === 'payment_collection' && !collData?.daily.length) ||
    (subTab === 'customer_ledger' && !custLedgerData?.customers.length) ||
    (subTab === 'ap_aging' && !apAgingData?.vendors.length) ||
    (subTab === 'outstanding' && !outstandingData?.invoices.length) ||
    (subTab === 'pl' && !plData?.monthly.length);

  const handleExport = () => {
    if (subTab === 'receivables') {
      if (!recData?.customers.length) return;
      const headers = 'Customer Name,Outstanding Balance\n';
      const rows = recData.customers
        .map((c) => `"${c.name.replace(/"/g, '""')}",${c.balance}`)
        .join('\n');
      triggerDownload(headers + rows, 'receivables-report.csv');
    } else if (subTab === 'payables') {
      if (!payData?.vendors.length) return;
      const headers = 'Vendor Name,Outstanding Balance\n';
      const rows = payData.vendors
        .map((v) => `"${v.name.replace(/"/g, '""')}",${v.balance}`)
        .join('\n');
      triggerDownload(headers + rows, 'payables-report.csv');
    } else if (subTab === 'payment_collection') {
      if (!collData?.daily.length) return;
      const headers = 'Date,Mode,Amount\n';
      const rows = collData.daily.map((d) => `${d.date},${d.mode},${d.total}`).join('\n');
      triggerDownload(headers + rows, `payment-collection-${from}-to-${to}.csv`);
    } else if (subTab === 'customer_ledger') {
      if (!custLedgerData?.customers.length) return;
      const headers = 'Customer,Invoices,Total Billed,Total Paid,Balance,Last Purchase\n';
      const rows = custLedgerData.customers
        .map(
          (c) =>
            `"${c.name.replace(/"/g, '""')}",${c.invoice_count},${c.total_billed},${c.total_paid},${c.balance},${c.last_purchase}`,
        )
        .join('\n');
      triggerDownload(headers + rows, `customer-ledger-${from}-to-${to}.csv`);
    } else if (subTab === 'ap_aging') {
      if (!apAgingData?.vendors.length) return;
      const headers = 'Vendor,Total Due,Current,1-30d,31-60d,61-90d,90+d\n';
      const rows = apAgingData.vendors
        .map(
          (v) =>
            `"${v.vendor_name.replace(/"/g, '""')}",${v.total_due},${v.current_amt},${v.d1_30},${v.d31_60},${v.d61_90},${v.d90_plus}`,
        )
        .join('\n');
      triggerDownload(headers + rows, 'ap-aging.csv');
    } else if (subTab === 'outstanding') {
      if (!outstandingData?.invoices.length) return;
      const headers = 'Invoice No,Date,Customer,Total,Paid,Balance,Due Date,Days Overdue\n';
      const rows = outstandingData.invoices
        .map(
          (inv) =>
            `"${inv.invoice_no}","${inv.invoice_date}","${inv.customer_name.replace(/"/g, '""')}",${inv.grand_total},${inv.amount_paid},${inv.balance_due},"${inv.due_date ?? ''}",${inv.days_overdue}`,
        )
        .join('\n');
      triggerDownload(headers + rows, 'outstanding-invoices.csv');
    } else if (subTab === 'pl') {
      if (!plData?.monthly.length) return;
      const headers = 'Month,Revenue,Returns,Net Revenue,Purchases (CoGS),Gross Profit\n';
      const rows = plData.monthly
        .map(
          (r) =>
            `"${r.month}",${r.revenue},${r.returns},${r.net_revenue},${r.purchases},${r.gross_profit}`,
        )
        .join('\n');
      triggerDownload(headers + rows, `pl-${from}-to-${to}.csv`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <SubTabToggle
          options={[
            { id: 'receivables', label: 'AR Aging' },
            { id: 'payables', label: 'Payables' },
            { id: 'payment_collection', label: 'Collections' },
            { id: 'customer_ledger', label: 'Customer Ledger' },
            { id: 'ap_aging', label: 'AP Aging' },
            { id: 'outstanding', label: 'Outstanding' },
            { id: 'pl', label: 'P&L' },
          ]}
          active={subTab}
          onChange={setSubTab}
        />
        {(subTab === 'payment_collection' || subTab === 'customer_ledger' || subTab === 'pl') && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        )}
        <div className="ml-auto self-end">
          <Button
            variant="outline"
            size="sm"
            disabled={exportDisabled}
            iconLeft={<Download className="h-4 w-4" />}
            onClick={handleExport}
          >
            Export CSV
          </Button>
        </div>
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
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
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
              <Boxes className="h-8 w-8 flex-shrink-0" />
              <div>
                This summary shows total unpaid purchase invoices grouped by vendor. Keep track of
                aging payables to maintain healthy supplier relationships.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
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
      ) : subTab === 'payment_collection' && collData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total Collected"
              value={<PriceDisplay value={collData.grand_total} />}
              icon={<DollarSign className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20 col-span-2 lg:col-span-1"
            />
            {collData.by_mode.map((m) => (
              <StatCard
                key={m.mode}
                label={m.mode.toUpperCase()}
                value={<PriceDisplay value={m.total} />}
                icon={<Receipt className="h-4 w-4" />}
              />
            ))}
          </div>

          {collData.grand_total !== '0.00' && collData.by_mode.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:shadow-md transition-shadow duration-200">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Collection by Mode
              </h3>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                {collData.by_mode.map((m) => {
                  const pct = (Number(m.total) / Number(collData.grand_total)) * 100;
                  const colorCls = MODE_COLORS[m.mode] ?? 'bg-gray-400';
                  const bg = colorCls.split(' ')[0] ?? 'bg-gray-400';
                  return (
                    <div
                      key={m.mode}
                      className={`${bg} h-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                      title={`${m.mode}: ${pct.toFixed(1)}%`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {collData.by_mode.map((m) => {
                  const colorCls = MODE_COLORS[m.mode] ?? 'bg-gray-100 text-gray-700';
                  return (
                    <span key={m.mode} className="flex items-center gap-1.5 font-medium capitalize">
                      <span className={`h-2.5 w-2.5 rounded-full ${colorCls.split(' ')[0]}`} />
                      {m.mode} — <PriceDisplay value={m.total} />
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
              Daily Collection
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Date</th>
                  {collectionPivot.modes.map((m) => (
                    <th key={m} className="px-4 py-3 text-right capitalize">
                      {m}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Day Total</th>
                </tr>
              </thead>
              <tbody>
                {collectionPivot.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={collectionPivot.modes.length + 2}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No collections in this period.
                    </td>
                  </tr>
                ) : (
                  collectionPivot.rows.map((row) => {
                    const dayTotal = collectionPivot.modes.reduce(
                      (acc, m) => acc + Number(row.totals[m] ?? 0),
                      0,
                    );
                    return (
                      <tr
                        key={row.date}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 tabular-nums">{row.date}</td>
                        {collectionPivot.modes.map((m) => (
                          <td key={m} className="px-4 py-3 text-right tabular-nums">
                            {row.totals[m] ? (
                              <PriceDisplay value={row.totals[m]!} currency="" />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          <PriceDisplay value={dayTotal.toFixed(2)} currency="" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'customer_ledger' && custLedgerData ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Invoices</th>
                <th className="px-4 py-3 text-right">Billed</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Paid</th>
                <th className="px-4 py-3 text-right">Balance</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Last Purchase</th>
              </tr>
            </thead>
            <tbody>
              {custLedgerData.customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    No customers found in this period.
                  </td>
                </tr>
              ) : (
                custLedgerData.customers.map((c, idx) => (
                  <tr
                    key={c.customer_id ?? `walk-in-${idx}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {c.invoice_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={c.total_billed} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 hidden md:table-cell">
                      <PriceDisplay value={c.total_paid} currency="" />
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums font-semibold',
                        Number(c.balance) > 0 ? 'text-rose-600' : 'text-muted-foreground',
                      )}
                    >
                      <PriceDisplay value={c.balance} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">
                      {c.last_purchase}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : subTab === 'ap_aging' && apAgingData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Total Payable"
              value={<PriceDisplay value={apAgingData.totals.total_due} />}
              icon={<ShoppingCart className="h-4 w-4" />}
              className="bg-rose-500/5 border-rose-500/20"
            />
            <StatCard
              label="Not Yet Due"
              value={<PriceDisplay value={apAgingData.totals.current_amt} />}
              icon={<Receipt className="h-4 w-4" />}
              className="bg-emerald-500/5 border-emerald-500/20"
            />
            <StatCard
              label="1–30 Days"
              value={<PriceDisplay value={apAgingData.totals.d1_30} />}
              icon={<AlertTriangle className="h-4 w-4" />}
              className="bg-sky-500/5 border-sky-500/20"
            />
            <StatCard
              label="31–60 Days"
              value={<PriceDisplay value={apAgingData.totals.d31_60} />}
              icon={<AlertTriangle className="h-4 w-4" />}
              className="bg-amber-500/5 border-amber-500/20"
            />
            <StatCard
              label="61–90 Days"
              value={<PriceDisplay value={apAgingData.totals.d61_90} />}
              icon={<AlertTriangle className="h-4 w-4" />}
              className="bg-orange-500/5 border-orange-500/20"
            />
            <StatCard
              label="90+ Days"
              value={<PriceDisplay value={apAgingData.totals.d90_plus} />}
              icon={<XCircle className="h-4 w-4" />}
              className="bg-rose-500/5 border-rose-500/20"
            />
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right">Total Due</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Current</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">1–30d</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">31–60d</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">61–90d</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">90+d</th>
                </tr>
              </thead>
              <tbody>
                {apAgingData.vendors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No outstanding payables.
                    </td>
                  </tr>
                ) : (
                  apAgingData.vendors.map((v, idx) => (
                    <tr
                      key={v.vendor_id ?? `unknown-${idx}`}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{v.vendor_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                        <PriceDisplay value={v.total_due} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600 hidden md:table-cell">
                        <PriceDisplay value={v.current_amt} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-sky-600 hidden md:table-cell">
                        <PriceDisplay value={v.d1_30} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600 hidden md:table-cell">
                        <PriceDisplay value={v.d31_60} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-orange-600 hidden lg:table-cell">
                        <PriceDisplay value={v.d61_90} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600 hidden lg:table-cell">
                        <PriceDisplay value={v.d90_plus} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'outstanding' && outstandingData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Total Outstanding"
              value={<PriceDisplay value={outstandingData.total_outstanding} />}
              icon={<Receipt className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
            <StatCard
              label="Overdue Invoices"
              value={outstandingData.overdue_count}
              icon={<AlertTriangle className="h-4 w-4" />}
              className="bg-rose-500/5 border-rose-500/20"
            />
            <StatCard
              label="Overdue Amount"
              value={<PriceDisplay value={outstandingData.overdue_amount} />}
              icon={<XCircle className="h-4 w-4" />}
              className="bg-rose-500/5 border-rose-500/20"
            />
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Invoice No</th>
                  <th className="px-4 py-3 hidden md:table-cell">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Total</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Due Date</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {outstandingData.invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No outstanding invoices.
                    </td>
                  </tr>
                ) : (
                  outstandingData.invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium">{inv.invoice_no}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {inv.invoice_date}
                      </td>
                      <td className="px-4 py-3">{inv.customer_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        <PriceDisplay value={inv.grand_total} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                        <PriceDisplay value={inv.balance_due} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                        {inv.due_date ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        {inv.days_overdue > 0 ? (
                          <span
                            className={cn(
                              'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                              inv.days_overdue > 90
                                ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                                : inv.days_overdue > 30
                                  ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                                  : 'bg-sky-500/10 text-sky-700 border-sky-500/20',
                            )}
                          >
                            {inv.days_overdue}d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'pl' && plData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Net Revenue"
              value={<PriceDisplay value={plData.totals.net_revenue} />}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Purchases (CoGS proxy)"
              value={<PriceDisplay value={plData.totals.purchases} />}
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <StatCard
              label="Gross Profit"
              value={<PriceDisplay value={plData.totals.gross_profit} />}
              icon={<DollarSign className="h-4 w-4" />}
              className={
                Number(plData.totals.gross_profit) >= 0
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-rose-500/5 border-rose-500/20'
              }
            />
          </div>
          <div className="text-xs text-muted-foreground text-right">
            Overall margin:{' '}
            <span className="font-semibold">{plData.totals.gross_margin_pct}%</span>
            &nbsp;·&nbsp; Gross Revenue:{' '}
            <span className="font-semibold">
              <PriceDisplay value={plData.totals.revenue} />
            </span>
            &nbsp;·&nbsp; Returns:{' '}
            <span className="font-semibold">
              <PriceDisplay value={plData.totals.returns} />
            </span>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
              Monthly Breakdown
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Returns</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Purchases</th>
                  <th className="px-4 py-3 text-right">Gross Profit</th>
                </tr>
              </thead>
              <tbody>
                {plData.monthly.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No data in this period.
                    </td>
                  </tr>
                ) : (
                  plData.monthly.map((r) => (
                    <tr
                      key={r.month}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-sm">{r.month}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={r.revenue} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-500 hidden md:table-cell">
                        <PriceDisplay value={r.returns} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-600 hidden md:table-cell">
                        <PriceDisplay value={r.purchases} currency="" />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right tabular-nums font-semibold',
                          Number(r.gross_profit) >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400',
                        )}
                      >
                        <PriceDisplay value={r.gross_profit} currency="" />
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

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.click();
  URL.revokeObjectURL(url);
}
