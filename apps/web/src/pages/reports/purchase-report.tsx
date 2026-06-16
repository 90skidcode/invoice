import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ItemTypeBadge,
  ItemTypeFilter,
  type ItemType,
  filterByItemType,
} from '@/components/ui/item-type-filter';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Download,
  FileSpreadsheet,
  Loader2,
  Receipt,
  ShoppingCart,
} from 'lucide-react';
import * as React from 'react';
import { DailySalesChart } from './charts';
import { ReportPagination, StatCard, SubTabToggle, firstOfMonth, today, type PageMeta } from './shared';

type PurSubTab = 'summary' | 'vendors' | 'items' | 'vendor_ledger';

export default function PurchaseReport() {
  const [subTab, setSubTab] = React.useState<PurSubTab>('summary');
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const [itemTypeFilter, setItemTypeFilter] = React.useState<ItemType>('all');
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => { setOffset(0); }, [subTab, from, to]);

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
    queryKey: ['rpt-pur-vendors', from, to, offset],
    queryFn: () =>
      api.get<{
        vendors: {
          vendor_id: string | null;
          name: string;
          count: number;
          taxable: string;
          total: string;
        }[];
        page: PageMeta;
      }>(`/reports/purchases/by-vendor?date_from=${from}&date_to=${to}&limit=50&offset=${offset}`),
    enabled: subTab === 'vendors',
  });

  const { data: itemsData, isLoading: isItemsLoading } = useQuery({
    queryKey: ['rpt-pur-items', from, to, offset],
    queryFn: () =>
      api.get<{
        items: {
          item_id: string;
          name: string;
          qty: string;
          taxable: string;
          total: string;
          is_finished_good?: boolean | null;
        }[];
        page: PageMeta;
      }>(`/reports/purchases/by-item?date_from=${from}&date_to=${to}&limit=50&offset=${offset}`),
    enabled: subTab === 'items',
  });

  const { data: vendorLedgerData, isLoading: isVendorLedgerLoading } = useQuery({
    queryKey: ['rpt-pur-vendor-ledger', from, to, offset],
    queryFn: () =>
      api.get<{
        vendors: {
          vendor_id: string | null;
          name: string;
          invoice_count: number;
          total_billed: string;
          total_paid: string;
          balance: string;
          last_purchase: string;
        }[];
        page: PageMeta;
      }>(`/reports/purchases/vendor-ledger?date_from=${from}&date_to=${to}&limit=50&offset=${offset}`),
    enabled: subTab === 'vendor_ledger',
  });

  const isLoading =
    subTab === 'summary'
      ? isSummaryLoading
      : subTab === 'vendors'
        ? isVendorsLoading
        : subTab === 'items'
          ? isItemsLoading
          : isVendorLedgerLoading;

  const exportDisabled =
    isLoading ||
    (subTab === 'summary' && !summaryData?.daily.length) ||
    (subTab === 'vendors' && !vendorsData?.vendors.length) ||
    (subTab === 'items' && !itemsData?.items.length) ||
    (subTab === 'vendor_ledger' && !vendorLedgerData?.vendors.length);

  const handleExport = () => {
    if (subTab === 'summary') {
      if (!summaryData?.daily.length) return;
      const headers = 'Date,Purchases,Total Amount\n';
      const rows = summaryData.daily.map((d) => `${d.date},${d.count},${d.grand}`).join('\n');
      triggerDownload(headers + rows, `purchase-summary-${from}-to-${to}.csv`);
    } else if (subTab === 'vendors') {
      if (!vendorsData?.vendors.length) return;
      const headers = 'Vendor Name,Bills,Taxable Amount,Total Amount\n';
      const rows = vendorsData.vendors
        .map((v) => `"${v.name.replace(/"/g, '""')}",${v.count},${v.taxable},${v.total}`)
        .join('\n');
      triggerDownload(headers + rows, `purchases-by-vendor-${from}-to-${to}.csv`);
    } else if (subTab === 'items') {
      if (!itemsData?.items.length) return;
      const headers = 'Item Name,Qty Purchased,Taxable Amount,Total Amount\n';
      const rows = itemsData.items
        .map((it) => `"${it.name.replace(/"/g, '""')}",${it.qty},${it.taxable},${it.total}`)
        .join('\n');
      triggerDownload(headers + rows, `purchases-by-item-${from}-to-${to}.csv`);
    } else if (subTab === 'vendor_ledger') {
      if (!vendorLedgerData?.vendors.length) return;
      const headers = 'Vendor,Bills,Total Billed,Total Paid,Balance,Last Purchase\n';
      const rows = vendorLedgerData.vendors
        .map(
          (v) =>
            `"${v.name.replace(/"/g, '""')}",${v.invoice_count},${v.total_billed},${v.total_paid},${v.balance},${v.last_purchase}`,
        )
        .join('\n');
      triggerDownload(headers + rows, `vendor-ledger-${from}-to-${to}.csv`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="pur-from-date" className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
            <Input
              id="pur-from-date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label htmlFor="pur-to-date" className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
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
                { id: 'vendor_ledger', label: 'Vendor Ledger' },
              ]}
              active={subTab}
              onChange={setSubTab}
            />
          </div>
        </div>
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
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Vendor Name</th>
                  <th className="px-4 py-3 text-right">Bills</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Taxable Amt</th>
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
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
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
          {vendorsData.page && <ReportPagination page={vendorsData.page} onPageChange={setOffset} />}
        </>
      ) : subTab === 'items' && itemsData ? (
        <>
          <ItemTypeFilter value={itemTypeFilter} onChange={setItemTypeFilter} />
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 text-right">Qty Purchased</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Taxable Amt</th>
                  <th className="px-4 py-3 text-right">Total Purchases</th>
                </tr>
              </thead>
              <tbody>
                {filterByItemType(itemsData.items, itemTypeFilter).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No items purchased in this period.
                    </td>
                  </tr>
                ) : (
                  filterByItemType(itemsData.items, itemTypeFilter).map((it) => (
                    <tr
                      key={it.item_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{it.name}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <ItemTypeBadge isFinishedGood={it.is_finished_good ?? false} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.qty}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
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
          {itemsData.page && <ReportPagination page={itemsData.page} onPageChange={setOffset} />}
        </>
      ) : subTab === 'vendor_ledger' && vendorLedgerData ? (
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Bills</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Total Billed</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Paid</th>
                  <th className="px-4 py-3 text-right">Balance Due</th>
                  <th className="px-4 py-3 text-right hidden lg:table-cell">Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {vendorLedgerData.vendors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No purchases in this period.
                    </td>
                  </tr>
                ) : (
                  vendorLedgerData.vendors.map((v, idx) => (
                    <tr
                      key={v.vendor_id ?? `unknown-${idx}`}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground tabular-nums font-mono text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {v.invoice_count}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        <PriceDisplay value={v.total_billed} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        <PriceDisplay value={v.total_paid} currency="" />
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right tabular-nums font-semibold',
                          Number(v.balance) > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        <PriceDisplay value={v.balance} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground hidden lg:table-cell">
                        {v.last_purchase}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {vendorLedgerData.page && <ReportPagination page={vendorLedgerData.page} onPageChange={setOffset} />}
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
