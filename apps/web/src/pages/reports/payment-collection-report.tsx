import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Download, Layers, Loader2, Wallet } from 'lucide-react';
import * as React from 'react';
import { firstOfMonth, today } from './shared';

interface PaymentModeSummary {
  mode: string;
  count: number;
  total: string;
}

interface PaymentTransaction {
  id: string;
  payment_id: string;
  payment_date: string;
  mode: string;
  amount: string;
  reference: string | null;
  invoice_id: string | null;
  invoice_no: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

interface PaymentCollectionData {
  from: string;
  to: string;
  grand_total: string;
  by_mode: PaymentModeSummary[];
  transactions: PaymentTransaction[];
}

const MODE_COLORS: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-700',
  upi: 'bg-violet-100 text-violet-700',
  card: 'bg-sky-100 text-sky-700',
  wallet: 'bg-amber-100 text-amber-700',
  cheque: 'bg-orange-100 text-orange-700',
  bank: 'bg-blue-100 text-blue-700',
  bank_transfer: 'bg-blue-100 text-blue-700',
  credit: 'bg-rose-100 text-rose-700',
};

function modeColor(mode: string): string {
  return MODE_COLORS[mode] ?? 'bg-gray-100 text-gray-700';
}

function modeLabel(mode: string): string {
  return mode
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export default function PaymentCollectionReport() {
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const [selectedMode, setSelectedMode] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedMode(null);
  }, [from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ['rpt-payment-collection', from, to],
    queryFn: () =>
      api.get<PaymentCollectionData>(
        `/reports/financial/payment-collection?date_from=${from}&date_to=${to}`,
      ),
  });

  const filteredTransactions = React.useMemo(() => {
    if (!data) return [];
    if (!selectedMode) return data.transactions;
    return data.transactions.filter((t) => t.mode === selectedMode);
  }, [data, selectedMode]);

  const exportCsv = () => {
    if (filteredTransactions.length === 0) return;
    const headers = 'Date,Customer Name,Mobile Number,Invoice,Payment Method,Amount\n';
    const rows = filteredTransactions
      .map((t) => {
        const name = (t.customer_name ?? 'Walk-in').replace(/"/g, '""');
        return `"${t.payment_date}","${name}","${t.customer_phone ?? ''}","${t.invoice_no ?? ''}","${modeLabel(t.mode)}",${t.amount}`;
      })
      .join('\n');
    const filename = `payment-collection-${selectedMode ?? 'all'}-${from}-to-${to}.csv`;
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="pc-from-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">From</span>
            <Input id="pc-from-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label htmlFor="pc-to-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">To</span>
            <Input id="pc-to-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isLoading || filteredTransactions.length === 0}
          iconLeft={<Download className="h-4 w-4" />}
          onClick={exportCsv}
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
          {/* Summary cards — one per payment mode, plus Grand Total */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.by_mode.map((m) => (
              <button
                key={m.mode}
                type="button"
                onClick={() => setSelectedMode(selectedMode === m.mode ? null : m.mode)}
                className={cn(
                  'relative rounded-xl border p-4 text-left transition-all duration-200 hover:shadow-md',
                  selectedMode === m.mode
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                        modeColor(m.mode),
                      )}
                    >
                      {modeLabel(m.mode)}
                    </span>
                    <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                      <PriceDisplay value={m.total} />
                    </p>
                    <p className="text-xs text-muted-foreground">{m.count} transaction{m.count === 1 ? '' : 's'}</p>
                  </div>
                  <Wallet className="h-4 w-4 text-muted-foreground/60" />
                </div>
              </button>
            ))}

            <button
              type="button"
              onClick={() => setSelectedMode(null)}
              className={cn(
                'relative rounded-xl border p-4 text-left transition-all duration-200 hover:shadow-md',
                selectedMode === null
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-primary/20 bg-primary/5',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Grand Total
                  </p>
                  <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                    <PriceDisplay value={data.grand_total} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data.transactions.length} transaction{data.transactions.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Layers className="h-4 w-4 text-muted-foreground/60" />
              </div>
            </button>
          </div>

          {/* Transaction detail table */}
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
              {selectedMode ? `${modeLabel(selectedMode)} Transactions` : 'All Transactions'}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer Name / Mobile</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No transactions in this period.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 tabular-nums font-mono text-xs text-muted-foreground">
                        {t.payment_date}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{t.customer_name ?? 'Walk-in'}</div>
                        {t.customer_phone && (
                          <div className="text-xs text-muted-foreground">{t.customer_phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        {t.invoice_no ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                            modeColor(t.mode),
                          )}
                        >
                          {modeLabel(t.mode)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={t.amount} currency="" />
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
