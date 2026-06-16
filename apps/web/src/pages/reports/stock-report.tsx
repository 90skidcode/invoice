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
  AlertTriangle,
  Boxes,
  DollarSign,
  Download,
  Loader2,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { TopStockItemsChart } from './charts';
import { ReportPagination, StatCard, SubTabToggle, firstOfMonth, today, type PageMeta } from './shared';

type StockSubTab = 'valuation' | 'low' | 'expiry' | 'ledger' | 'location';

const TXN_LABELS: Record<string, string> = {
  sale: 'Sale',
  purchase: 'Purchase',
  adjustment: 'Adjustment',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  production_consume: 'Production Use',
  production_produce: 'Production Output',
  opening: 'Opening',
  return: 'Return',
};

export default function StockReport() {
  const [subTab, setSubTab] = React.useState<StockSubTab>('valuation');
  const [itemTypeFilter, setItemTypeFilter] = React.useState<ItemType>('all');
  const [ledgerFrom, setLedgerFrom] = React.useState(firstOfMonth());
  const [ledgerTo, setLedgerTo] = React.useState(today());
  const [ledgerSearch, setLedgerSearch] = React.useState('');
  const [expiryDays, setExpiryDays] = React.useState(90);
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => { setOffset(0); }, [subTab, expiryDays, ledgerFrom, ledgerTo, ledgerSearch]);

  const { data: valData, isLoading: isValLoading } = useQuery({
    queryKey: ['rpt-stock-valuation', offset],
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
          is_finished_good?: boolean | null;
        }[];
        page: PageMeta;
      }>(`/reports/stock/valuation?limit=50&offset=${offset}`),
    enabled: subTab === 'valuation',
  });

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
          is_finished_good?: boolean | null;
        }[];
      }>('/reports/stock/low'),
    enabled: subTab === 'low',
  });

  const { data: expiryData, isLoading: isExpiryLoading } = useQuery({
    queryKey: ['rpt-stock-expiry', expiryDays, offset],
    queryFn: () =>
      api.get<{
        as_of: string;
        days_ahead: number;
        expiring: {
          batch_id: string;
          batch_no: string;
          item_id: string;
          item_name: string;
          item_sku: string;
          expiry_date: string | null;
          mfg_date: string | null;
          current_qty: string;
          days_to_expiry: number | null;
        }[];
        expired: {
          batch_id: string;
          batch_no: string;
          item_id: string;
          item_name: string;
          item_sku: string;
          expiry_date: string | null;
          mfg_date: string | null;
          current_qty: string;
          days_to_expiry: number | null;
        }[];
        page: { expiring_total: number; expired_total: number; limit: number; offset: number };
      }>(`/reports/stock/expiry?days_ahead=${expiryDays}&limit=50&offset=${offset}`),
    enabled: subTab === 'expiry',
  });

  const { data: locationData, isLoading: isLocationLoading } = useQuery({
    queryKey: ['rpt-stock-location', offset],
    queryFn: () =>
      api.get<{
        items: {
          item_id: string;
          item_name: string;
          item_sku: string;
          location_id: string;
          location_name: string;
          qty: string;
        }[];
        page: PageMeta;
      }>(`/reports/stock/location?limit=50&offset=${offset}`),
    enabled: subTab === 'location',
  });

  const { data: ledgerData, isLoading: isLedgerLoading } = useQuery({
    queryKey: ['rpt-stock-ledger', ledgerFrom, ledgerTo, offset],
    queryFn: () =>
      api.get<{
        entries: {
          id: string;
          txn_type: string;
          txn_date: string;
          item_id: string;
          item_name: string | null;
          item_sku: string | null;
          qty_in: string;
          qty_out: string;
          balance_qty: string;
          rate: string | null;
          note: string | null;
        }[];
        page: PageMeta;
      }>(`/reports/stock/ledger?date_from=${ledgerFrom}&date_to=${ledgerTo}&limit=50&offset=${offset}`),
    enabled: subTab === 'ledger',
  });

  const downloadValuationCSV = () => {
    if (!valData?.items.length) return;
    const headers = 'SKU,Item Name,Qty,Avg Cost,Valuation,Selling Price,Selling Value\n';
    const rows = valData.items
      .map(
        (it) =>
          `"${it.sku}","${it.name.replace(/"/g, '""')}",${it.qty},${it.avg_cost},${it.value},${it.sale_price},${it.sale_value}`,
      )
      .join('\n');
    triggerDownload(headers + rows, 'stock-valuation-report.csv');
  };

  const downloadLowStockCSV = () => {
    if (!lowData?.items.length) return;
    const headers = 'SKU,Item Name,Current Stock,Reorder Level,Reorder Qty\n';
    const rows = lowData.items
      .map(
        (it) =>
          `"${it.sku}","${it.name.replace(/"/g, '""')}",${it.current_stock},${it.reorder_level},${it.reorder_qty}`,
      )
      .join('\n');
    triggerDownload(headers + rows, 'low-stock-report.csv');
  };

  const downloadExpiryCSV = () => {
    if (!expiryData) return;
    const all = [...expiryData.expiring, ...expiryData.expired];
    if (!all.length) return;
    const headers = 'Item,SKU,Batch No,Expiry Date,Days to Expiry,Qty\n';
    const rows = all
      .map(
        (b) =>
          `"${b.item_name.replace(/"/g, '""')}","${b.item_sku ?? ''}","${b.batch_no}","${b.expiry_date ?? ''}",${b.days_to_expiry ?? ''},${b.current_qty}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `expiry-report-${expiryData.as_of}.csv`);
  };

  const downloadLedgerCSV = () => {
    if (!ledgerData?.entries.length) return;
    const headers = 'Date,Item,SKU,Type,Qty In,Qty Out,Balance,Note\n';
    const rows = ledgerData.entries
      .map(
        (e) =>
          `"${e.txn_date}","${(e.item_name ?? '').replace(/"/g, '""')}","${e.item_sku ?? ''}","${e.txn_type}",${e.qty_in},${e.qty_out},${e.balance_qty},"${(e.note ?? '').replace(/"/g, '""')}"`,
      )
      .join('\n');
    triggerDownload(headers + rows, `stock-ledger-${ledgerFrom}-to-${ledgerTo}.csv`);
  };

  const downloadLocationCSV = () => {
    if (!locationData?.items.length) return;
    const headers = 'Location,SKU,Item Name,Qty\n';
    const rows = locationData.items
      .map(
        (it) =>
          `"${it.location_name.replace(/"/g, '""')}","${it.item_sku}","${it.item_name.replace(/"/g, '""')}",${it.qty}`,
      )
      .join('\n');
    triggerDownload(headers + rows, 'location-stock.csv');
  };

  const isLoading =
    subTab === 'valuation'
      ? isValLoading
      : subTab === 'low'
        ? isLowLoading
        : subTab === 'expiry'
          ? isExpiryLoading
          : subTab === 'ledger'
            ? isLedgerLoading
            : isLocationLoading;

  const filteredLedger = ledgerData?.entries.filter(
    (e) =>
      !ledgerSearch ||
      (e.item_name ?? '').toLowerCase().includes(ledgerSearch.toLowerCase()) ||
      (e.item_sku ?? '').toLowerCase().includes(ledgerSearch.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SubTabToggle
          options={[
            { id: 'valuation', label: 'Stock Valuation' },
            { id: 'low', label: 'Low Stock' },
            { id: 'expiry', label: 'Expiry' },
            { id: 'ledger', label: 'Stock Ledger' },
            { id: 'location', label: 'By Location' },
          ]}
          active={subTab}
          onChange={setSubTab}
        />
        {subTab === 'expiry' && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Expiring within</span>
            <select
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
            </select>
          </label>
        )}
        {subTab === 'ledger' && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground font-medium">From</span>
              <Input
                type="date"
                value={ledgerFrom}
                onChange={(e) => setLedgerFrom(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground font-medium">To</span>
              <Input
                type="date"
                value={ledgerTo}
                onChange={(e) => setLedgerTo(e.target.value)}
              />
            </label>
            <div className="self-end">
              <Input
                placeholder="Search item..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-40"
              />
            </div>
          </>
        )}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={
              isLoading ||
              (subTab === 'valuation' && !valData?.items.length) ||
              (subTab === 'low' && !lowData?.items.length) ||
              (subTab === 'expiry' &&
                !expiryData?.expiring.length &&
                !expiryData?.expired.length) ||
              (subTab === 'ledger' && !ledgerData?.entries.length) ||
              (subTab === 'location' && !locationData?.items.length)
            }
            iconLeft={<Download className="h-4 w-4" />}
            onClick={
              subTab === 'valuation'
                ? downloadValuationCSV
                : subTab === 'low'
                  ? downloadLowStockCSV
                  : subTab === 'expiry'
                    ? downloadExpiryCSV
                    : subTab === 'ledger'
                      ? downloadLedgerCSV
                      : downloadLocationCSV
            }
          >
            Export CSV
          </Button>
        </div>
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

          <ItemTypeFilter value={itemTypeFilter} onChange={setItemTypeFilter} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Avg Cost</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Selling Price</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Selling Value</th>
                </tr>
              </thead>
              <tbody>
                {filterByItemType(valData.items, itemTypeFilter).map((it) => (
                  <tr
                    key={it.item_id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      {it.name}
                      <div className="font-mono text-xs text-muted-foreground mt-0.5">{it.sku}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <ItemTypeBadge isFinishedGood={it.is_finished_good ?? false} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{it.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      <PriceDisplay value={it.avg_cost} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={it.value} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      <PriceDisplay value={it.sale_price} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600 hidden md:table-cell">
                      <PriceDisplay value={it.sale_value} currency="" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {valData.page && <ReportPagination page={valData.page} onPageChange={setOffset} />}
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

          <ItemTypeFilter value={itemTypeFilter} onChange={setItemTypeFilter} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 text-right">Current Stock</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Reorder Level</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Reorder Qty</th>
                </tr>
              </thead>
              <tbody>
                {filterByItemType(lowData.items, itemTypeFilter).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No items below reorder levels. All stock levels are safe!
                    </td>
                  </tr>
                ) : (
                  filterByItemType(lowData.items, itemTypeFilter).map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {it.name}
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">
                          {it.sku}
                        </div>
                        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                          Reorder: {it.reorder_level}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <ItemTypeBadge isFinishedGood={it.is_finished_good ?? false} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600 tabular-nums">
                        {it.current_stock}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {it.reorder_level}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {it.reorder_qty}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'expiry' && expiryData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={`Expiring (next ${expiryDays}d)`}
              value={expiryData.expiring.length}
              icon={<AlertTriangle className="h-4 w-4" />}
              className={
                expiryData.expiring.length > 0
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'bg-primary/5 border-primary/20'
              }
            />
            <StatCard
              label="Already Expired (w/ stock)"
              value={expiryData.expired.length}
              icon={<XCircle className="h-4 w-4" />}
              className={
                expiryData.expired.length > 0
                  ? 'border-rose-200 bg-rose-50/50'
                  : 'bg-primary/5 border-primary/20'
              }
            />
          </div>

          {expiryData.expiring.length > 0 && (
            <div className="rounded-xl border border-amber-200 overflow-hidden bg-card">
              <div className="border-b border-amber-200 px-4 py-3 text-sm font-semibold bg-amber-50/40 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Expiring in next {expiryDays} days
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 hidden md:table-cell">Batch</th>
                    <th className="px-4 py-3 text-right">Expiry Date</th>
                    <th className="px-4 py-3 text-right">Days Left</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryData.expiring.map((b) => (
                    <tr
                      key={b.batch_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {b.item_name}
                        {b.item_sku && (
                          <div className="font-mono text-xs text-muted-foreground mt-0.5">
                            {b.item_sku}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs">
                        {b.batch_no}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{b.expiry_date}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                            (b.days_to_expiry ?? 999) <= 30
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {b.days_to_expiry}d
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {Number(b.current_qty).toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expiryData.expired.length > 0 && (
            <div className="rounded-xl border border-rose-200 overflow-hidden bg-card">
              <div className="border-b border-rose-200 px-4 py-3 text-sm font-semibold bg-rose-50/40 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-rose-600" />
                Already Expired — stock still present
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 hidden md:table-cell">Batch</th>
                    <th className="px-4 py-3 text-right">Expired On</th>
                    <th className="px-4 py-3 text-right">Days Ago</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {expiryData.expired.map((b) => (
                    <tr
                      key={b.batch_id}
                      className="border-b border-border last:border-0 hover:bg-rose-50/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">
                        {b.item_name}
                        {b.item_sku && (
                          <div className="font-mono text-xs text-muted-foreground mt-0.5">
                            {b.item_sku}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs">
                        {b.batch_no}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                        {b.expiry_date}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600 font-semibold">
                        {b.days_to_expiry !== null ? Math.abs(b.days_to_expiry) : '—'}d ago
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        {Number(b.current_qty).toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expiryData.expiring.length === 0 && expiryData.expired.length === 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-8 text-center text-sm text-emerald-700">
              No batches expiring in the next {expiryDays} days and no expired stock on hand.
            </div>
          )}
          {expiryData.page && (expiryData.page.expiring_total + expiryData.page.expired_total) > expiryData.page.limit && (
            <ReportPagination
              page={{ total: expiryData.page.expiring_total + expiryData.page.expired_total, limit: expiryData.page.limit, offset: expiryData.page.offset }}
              onPageChange={setOffset}
            />
          )}
        </>
      ) : subTab === 'ledger' && ledgerData ? (
        <>
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30 flex items-center justify-between">
            <span>Stock Movements</span>
            <span className="text-xs text-muted-foreground font-normal">
              {filteredLedger?.length ?? 0} of {ledgerData.page.total} entries
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 hidden md:table-cell">Type</th>
                <th className="px-4 py-3 text-right">In</th>
                <th className="px-4 py-3 text-right">Out</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Balance</th>
                <th className="px-4 py-3 hidden lg:table-cell">Note</th>
              </tr>
            </thead>
            <tbody>
              {!filteredLedger?.length ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {ledgerSearch
                      ? 'No entries match your search.'
                      : 'No stock movements in this period.'}
                  </td>
                </tr>
              ) : (
                filteredLedger.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                      {new Date(e.txn_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {e.item_name ?? '—'}
                      {e.item_sku && (
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">
                          {e.item_sku}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium capitalize">
                        {TXN_LABELS[e.txn_type] ?? e.txn_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 font-semibold">
                      {Number(e.qty_in) > 0 ? `+${Number(e.qty_in).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-600 font-semibold">
                      {Number(e.qty_out) > 0 ? `-${Number(e.qty_out).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell font-mono text-xs">
                      {Number(e.balance_qty).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell truncate max-w-[200px]">
                      {e.note ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          {ledgerData.page && <ReportPagination page={ledgerData.page} onPageChange={setOffset} />}
        </>
      ) : subTab === 'location' && locationData ? (
        <>
          {locationData.items.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground text-sm">
              No stock movements recorded.
            </div>
          ) : (
            (() => {
              const byLocation = locationData.items.reduce<
                Record<string, typeof locationData.items>
              >((acc, it) => {
                const loc = it.location_name;
                if (!acc[loc]) acc[loc] = [];
                acc[loc]!.push(it);
                return acc;
              }, {});
              return Object.entries(byLocation).map(([loc, rows]) => (
                <div key={loc} className="rounded-xl border border-border overflow-hidden bg-card">
                  <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30 flex items-center gap-2">
                    <Boxes className="h-4 w-4 text-muted-foreground" />
                    {loc}
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {rows.length} SKU{rows.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                        <th className="px-4 py-3 hidden md:table-cell">SKU</th>
                        <th className="px-4 py-3">Item Name</th>
                        <th className="px-4 py-3 text-right">Qty on Hand</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((it) => (
                        <tr
                          key={`${it.item_id}-${it.location_id}`}
                          className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">
                            {it.item_sku}
                          </td>
                          <td className="px-4 py-3 font-medium">{it.item_name}</td>
                          <td
                            className={cn(
                              'px-4 py-3 text-right tabular-nums font-semibold',
                              Number(it.qty) < 0 ? 'text-rose-600 dark:text-rose-400' : '',
                            )}
                          >
                            {Number(it.qty).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ));
            })()
          )}
          {locationData.page && <ReportPagination page={locationData.page} onPageChange={setOffset} />}
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
