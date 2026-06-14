import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateDisplay, PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus, Search, ShoppingCart } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface PurchaseListRow {
  id: string;
  voucher_no: string;
  voucher_date: string;
  vendor_name: string | null;
  vendor_invoice_no: string;
  grand_total: string;
  balance_due: string;
  payment_status: string;
  status: string;
}

export function PurchasesListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = React.useState('');
  const [savedNotice, setSavedNotice] = React.useState<string | null>(
    (location.state as { saved?: string } | null)?.saved ?? null,
  );

  // Clear the one-shot navigation state so a refresh doesn't keep the banner.
  React.useEffect(() => {
    if ((location.state as { saved?: string } | null)?.saved) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const { data, isLoading, error } = useQuery<PurchaseListRow[]>({
    queryKey: ['purchases-list'],
    queryFn: () => api.get<PurchaseListRow[]>('/purchase-invoices?limit=200'),
  });

  const purchases = React.useMemo(() => {
    const all = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (p) =>
        p.voucher_no.toLowerCase().includes(q) ||
        p.vendor_invoice_no.toLowerCase().includes(q) ||
        (p.vendor_name ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const downloadCSV = () => {
    if (!purchases.length) return;
    const headers = 'Voucher,Date,Vendor,Vendor Invoice,Total,Status\n';
    const rows = purchases
      .map(
        (p) =>
          `"${p.voucher_no}","${p.voucher_date}","${(p.vendor_name ?? '').replace(/"/g, '""')}","${p.vendor_invoice_no}",${p.grand_total},"${p.status}"`,
      )
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'purchases-list.csv');
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Purchases</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={purchases.length === 0}
            iconLeft={<Download className="h-4 w-4" />}
            onClick={downloadCSV}
          >
            Export CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={() => navigate('/purchases/new')}
          >
            New Purchase
          </Button>
        </div>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-3 text-sm">
          <span>{savedNotice}</span>
          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground hover:underline"
            onClick={() => setSavedNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search voucher, vendor…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">
            Failed to load purchases
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <ShoppingCart className="h-10 w-10 opacity-30" />
            <p className="font-medium">No purchases yet</p>
            <p className="text-sm">Record your first purchase to receive stock</p>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/purchases/new')}
            >
              New Purchase
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Voucher</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Vendor</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">
                  Vendor Inv.
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Due</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground hidden md:table-cell">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {p.voucher_no}
                    <div className="md:hidden text-muted-foreground font-sans mt-0.5">
                      {p.vendor_name ?? '—'}
                    </div>
                    <div className="md:hidden text-muted-foreground mt-0.5">
                      <DateDisplay value={p.voucher_date} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <DateDisplay value={p.voucher_date} />
                  </td>
                  <td className="px-4 py-2.5 font-medium hidden md:table-cell">{p.vendor_name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{p.vendor_invoice_no}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <PriceDisplay value={p.grand_total} currency="" />
                    {Number(p.balance_due) > 0 && (
                      <div className="md:hidden text-xs text-destructive mt-0.5">
                        Due <PriceDisplay value={p.balance_due} currency="" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">
                    {Number(p.balance_due) > 0 ? (
                      <PriceDisplay
                        value={p.balance_due}
                        currency=""
                        className="text-destructive"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <StatusBadge status={p.status === 'voided' ? 'voided' : p.payment_status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {p.status !== 'voided' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/purchases/${p.id}/edit`)}
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
