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
  FileSpreadsheet,
  Loader2,
  Receipt,
  ShoppingCart,
  Tag,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import * as React from 'react';
import { DailySalesChart, SalesByItemChart } from './charts';
import { StatCard, SubTabToggle, firstOfMonth, today } from './shared';

type SalesSubTab =
  | 'summary'
  | 'items'
  | 'soaps'
  | 'referrals'
  | 'voids'
  | 'returns'
  | 'discounts'
  | 'top_customers'
  | 'day_book'
  | 'margin'
  | 'salesperson'
  | 'by_category';

export default function SalesReport() {
  const [subTab, setSubTab] = React.useState<SalesSubTab>('summary');
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const [itemTypeFilter, setItemTypeFilter] = React.useState<ItemType>('all');

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

  const { data: itemsData, isLoading: isItemsLoading } = useQuery({
    queryKey: ['rpt-sales-items', from, to],
    queryFn: () =>
      api.get<{
        from: string;
        to: string;
        items: {
          item_id: string;
          name: string;
          qty: string;
          taxable: string;
          total: string;
          is_finished_good?: boolean | null;
        }[];
      }>(`/reports/sales/by-item?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'items',
  });

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

  const { data: voidsData, isLoading: isVoidsLoading } = useQuery({
    queryKey: ['rpt-sales-voids', from, to],
    queryFn: () =>
      api.get<{
        count: number;
        total: string;
        bills: {
          id: string;
          invoice_no: string;
          invoice_date: string;
          customer_name: string | null;
          grand_total: string;
          void_reason: string | null;
          voided_at: string | null;
        }[];
      }>(`/reports/sales/voided?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'voids',
  });

  const { data: returnsData, isLoading: isReturnsLoading } = useQuery({
    queryKey: ['rpt-sales-returns', from, to],
    queryFn: () =>
      api.get<{
        count: number;
        total: string;
        returns: {
          id: string;
          credit_note_no: string;
          credit_note_date: string;
          customer_name: string | null;
          original_invoice_no: string | null;
          reason: string;
          grand_total: string;
        }[];
      }>(`/reports/sales/returns?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'returns',
  });

  const { data: discountsData, isLoading: isDiscountsLoading } = useQuery({
    queryKey: ['rpt-sales-discounts', from, to],
    queryFn: () =>
      api.get<{
        totals: { invoice_count: number; total_discount: string; total_sales: string };
        items: {
          item_id: string;
          name: string;
          qty: string;
          discount_amt: string;
          total_before: string;
        }[];
      }>(`/reports/sales/discounts?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'discounts',
  });

  const { data: topCustData, isLoading: isTopCustLoading } = useQuery({
    queryKey: ['rpt-sales-top-customers', from, to],
    queryFn: () =>
      api.get<{
        customers: {
          customer_id: string | null;
          name: string;
          invoice_count: number;
          total: string;
          last_purchase: string;
        }[];
      }>(`/reports/sales/top-customers?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'top_customers',
  });

  const { data: dayBookData, isLoading: isDayBookLoading } = useQuery({
    queryKey: ['rpt-day-book', from, to],
    queryFn: () =>
      api.get<{
        entries: {
          date: string;
          type: string;
          ref_no: string;
          party: string;
          amount: string;
          mode: string;
          note: string;
        }[];
        totals: {
          total_in: string;
          total_out: string;
          net: string;
          sales_count: number;
          return_count: number;
          payment_in_count: number;
          payment_out_count: number;
        };
      }>(`/reports/financial/day-book?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'day_book',
  });

  const { data: marginData, isLoading: isMarginLoading } = useQuery({
    queryKey: ['rpt-sales-margin', from, to],
    queryFn: () =>
      api.get<{
        items: {
          item_id: string;
          name: string;
          qty_sold: string;
          revenue: string;
          cost: string;
          gross_profit: string;
          margin_pct: string;
        }[];
        totals: {
          revenue: string;
          cost: string;
          gross_profit: string;
          overall_margin_pct: string;
        };
      }>(`/reports/sales/margin?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'margin',
  });

  const { data: salespersonData, isLoading: isSalespersonLoading } = useQuery({
    queryKey: ['rpt-sales-salesperson', from, to],
    queryFn: () =>
      api.get<{
        salespersons: {
          salesperson_id: string | null;
          name: string;
          invoice_count: number;
          total: string;
          taxable: string;
          avg_value: string;
          total_collected: string;
        }[];
      }>(`/reports/sales/salesperson?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'salesperson',
  });

  const { data: categoryData, isLoading: isCategoryLoading } = useQuery({
    queryKey: ['rpt-sales-category', from, to],
    queryFn: () =>
      api.get<{
        categories: {
          category_id: string | null;
          category_name: string;
          item_count: number;
          invoice_count: number;
          qty: string;
          taxable: string;
          total: string;
          discount: string;
        }[];
      }>(`/reports/sales/by-category?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'by_category',
  });

  const downloadSummaryCSV = () => {
    if (!summaryData?.daily.length) return;
    const headers = 'Date,Invoices,Total Amount\n';
    const rows = summaryData.daily.map((d) => `${d.date},${d.count},${d.grand}`).join('\n');
    triggerDownload(headers + rows, `sales-summary-${from}-to-${to}.csv`);
  };

  const downloadItemsCSV = () => {
    if (!itemsData?.items.length) return;
    const headers = 'Item Name,Qty Sold,Taxable Amount,Total Amount\n';
    const rows = itemsData.items
      .map((it) => `"${it.name.replace(/"/g, '""')}",${it.qty},${it.taxable},${it.total}`)
      .join('\n');
    triggerDownload(headers + rows, `sales-by-item-${from}-to-${to}.csv`);
  };

  const downloadSoapsCSV = () => {
    if (!soapsData?.customers.length) return;
    const headers = 'Customer Name,Soaps Purchased,Total Spent\n';
    const rows = soapsData.customers
      .map((c) => `"${c.name.replace(/"/g, '""')}",${c.qty},${c.total}`)
      .join('\n');
    triggerDownload(headers + rows, `soaps-by-customer-${from}-to-${to}.csv`);
  };

  const downloadReferralsCSV = () => {
    if (!referralsData?.referrals.length) return;
    const headers = 'Referrer Name,Invoices Count,Total Referred Amount\n';
    const rows = referralsData.referrals
      .map((r) => `"${r.referrer_name.replace(/"/g, '""')}",${r.count},${r.total}`)
      .join('\n');
    triggerDownload(headers + rows, `sales-by-referral-${from}-to-${to}.csv`);
  };

  const downloadVoidsCSV = () => {
    if (!voidsData?.bills.length) return;
    const headers = 'Invoice No,Date,Customer,Amount,Void Reason\n';
    const rows = voidsData.bills
      .map(
        (b) =>
          `"${b.invoice_no}","${b.invoice_date}","${(b.customer_name ?? 'Walk-in').replace(/"/g, '""')}",${b.grand_total},"${(b.void_reason ?? '').replace(/"/g, '""')}"`,
      )
      .join('\n');
    triggerDownload(headers + rows, `voided-bills-${from}-to-${to}.csv`);
  };

  const downloadReturnsCSV = () => {
    if (!returnsData?.returns.length) return;
    const headers = 'Credit Note No,Date,Customer,Original Invoice,Reason,Amount\n';
    const rows = returnsData.returns
      .map(
        (r) =>
          `"${r.credit_note_no}","${r.credit_note_date}","${(r.customer_name ?? 'Walk-in').replace(/"/g, '""')}","${r.original_invoice_no ?? ''}","${r.reason}",${r.grand_total}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `sales-returns-${from}-to-${to}.csv`);
  };

  const downloadDiscountsCSV = () => {
    if (!discountsData?.items.length) return;
    const headers = 'Item Name,Qty,Discount Amount,MRP Total\n';
    const rows = discountsData.items
      .map(
        (it) =>
          `"${it.name.replace(/"/g, '""')}",${it.qty},${it.discount_amt},${it.total_before}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `discount-analysis-${from}-to-${to}.csv`);
  };

  const downloadTopCustCSV = () => {
    if (!topCustData?.customers.length) return;
    const headers = 'Customer,Invoices,Total Revenue,Last Purchase\n';
    const rows = topCustData.customers
      .map(
        (c) =>
          `"${c.name.replace(/"/g, '""')}",${c.invoice_count},${c.total},${c.last_purchase}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `top-customers-${from}-to-${to}.csv`);
  };

  const downloadDayBookCSV = () => {
    if (!dayBookData?.entries.length) return;
    const headers = 'Date,Type,Ref No,Party,Amount,Mode,Note\n';
    const rows = dayBookData.entries
      .map(
        (e) =>
          `"${e.date}","${e.type}","${e.ref_no}","${e.party.replace(/"/g, '""')}","${e.amount}","${e.mode}","${e.note.replace(/"/g, '""')}"`,
      )
      .join('\n');
    triggerDownload(headers + rows, `day-book-${from}-to-${to}.csv`);
  };

  const downloadMarginCSV = () => {
    if (!marginData?.items.length) return;
    const headers = 'Item Name,Qty Sold,Revenue,Cost,Gross Profit,Margin %\n';
    const rows = marginData.items
      .map(
        (it) =>
          `"${it.name.replace(/"/g, '""')}",${it.qty_sold},${it.revenue},${it.cost},${it.gross_profit},${it.margin_pct}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `item-margin-${from}-to-${to}.csv`);
  };

  const downloadSalespersonCSV = () => {
    if (!salespersonData?.salespersons.length) return;
    const headers = 'Salesperson,Invoices,Total Revenue,Avg Value,Collected\n';
    const rows = salespersonData.salespersons
      .map(
        (s) =>
          `"${s.name.replace(/"/g, '""')}",${s.invoice_count},${s.total},${s.avg_value},${s.total_collected}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `salesperson-${from}-to-${to}.csv`);
  };

  const downloadCategoryCSV = () => {
    if (!categoryData?.categories.length) return;
    const headers = 'Category,Items,Invoices,Qty,Taxable,Total,Discount\n';
    const rows = categoryData.categories
      .map(
        (c) =>
          `"${c.category_name.replace(/"/g, '""')}",${c.item_count},${c.invoice_count},${c.qty},${c.taxable},${c.total},${c.discount}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `category-sales-${from}-to-${to}.csv`);
  };

  const isLoading =
    subTab === 'summary'
      ? isSummaryLoading
      : subTab === 'items'
        ? isItemsLoading
        : subTab === 'soaps'
          ? isSoapsLoading
          : subTab === 'referrals'
            ? isReferralsLoading
            : subTab === 'voids'
              ? isVoidsLoading
              : subTab === 'returns'
                ? isReturnsLoading
                : subTab === 'discounts'
                  ? isDiscountsLoading
                  : subTab === 'top_customers'
                    ? isTopCustLoading
                    : subTab === 'day_book'
                      ? isDayBookLoading
                      : subTab === 'margin'
                        ? isMarginLoading
                        : subTab === 'salesperson'
                          ? isSalespersonLoading
                          : isCategoryLoading;

  const exportAction =
    subTab === 'summary'
      ? downloadSummaryCSV
      : subTab === 'items'
        ? downloadItemsCSV
        : subTab === 'soaps'
          ? downloadSoapsCSV
          : subTab === 'referrals'
            ? downloadReferralsCSV
            : subTab === 'voids'
              ? downloadVoidsCSV
              : subTab === 'returns'
                ? downloadReturnsCSV
                : subTab === 'discounts'
                  ? downloadDiscountsCSV
                  : subTab === 'top_customers'
                    ? downloadTopCustCSV
                    : subTab === 'day_book'
                      ? downloadDayBookCSV
                      : subTab === 'margin'
                        ? downloadMarginCSV
                        : subTab === 'salesperson'
                          ? downloadSalespersonCSV
                          : downloadCategoryCSV;

  const exportDisabled =
    isLoading ||
    (subTab === 'summary' && !summaryData?.daily.length) ||
    (subTab === 'items' && !itemsData?.items.length) ||
    (subTab === 'soaps' && !soapsData?.customers.length) ||
    (subTab === 'referrals' && !referralsData?.referrals.length) ||
    (subTab === 'voids' && !voidsData?.bills.length) ||
    (subTab === 'returns' && !returnsData?.returns.length) ||
    (subTab === 'discounts' && !discountsData?.items.length) ||
    (subTab === 'top_customers' && !topCustData?.customers.length) ||
    (subTab === 'day_book' && !dayBookData?.entries.length) ||
    (subTab === 'margin' && !marginData?.items.length) ||
    (subTab === 'salesperson' && !salespersonData?.salespersons.length) ||
    (subTab === 'by_category' && !categoryData?.categories.length);

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
                { id: 'items', label: 'By Item' },
                { id: 'soaps', label: 'Soaps' },
                { id: 'referrals', label: 'Referrals' },
                { id: 'voids', label: 'Voids' },
                { id: 'returns', label: 'Returns' },
                { id: 'discounts', label: 'Discounts' },
                { id: 'top_customers', label: 'Top Customers' },
                { id: 'day_book', label: 'Day Book' },
                { id: 'margin', label: 'Item Margin' },
                { id: 'salesperson', label: 'Salesperson' },
                { id: 'by_category', label: 'By Category' },
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
          onClick={exportAction}
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

          <ItemTypeFilter value={itemTypeFilter} onChange={setItemTypeFilter} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Item Name</th>
                  <th className="px-4 py-3 hidden md:table-cell">Type</th>
                  <th className="px-4 py-3 text-right">Qty Sold</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Taxable Amt</th>
                  <th className="px-4 py-3 text-right">Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {filterByItemType(itemsData.items, itemTypeFilter).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No items sold in this period.
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
        </>
      ) : subTab === 'soaps' && soapsData ? (
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
      ) : subTab === 'referrals' && referralsData ? (
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
      ) : subTab === 'voids' && voidsData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Voided Bills"
              value={voidsData.count}
              icon={<XCircle className="h-4 w-4" />}
              {...(voidsData.count > 0 ? { className: 'border-rose-200 bg-rose-50/50' } : {})}
            />
            <StatCard
              label="Value Cancelled"
              value={<PriceDisplay value={voidsData.total} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Invoice No</th>
                  <th className="px-4 py-3 hidden md:table-cell">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 hidden md:table-cell">Reason</th>
                </tr>
              </thead>
              <tbody>
                {voidsData.bills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No voided bills in this period.
                    </td>
                  </tr>
                ) : (
                  voidsData.bills.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{b.invoice_no}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {b.invoice_date}
                      </td>
                      <td className="px-4 py-3 font-medium">{b.customer_name ?? 'Walk-in'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-600">
                        <PriceDisplay value={b.grand_total} currency="" />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                        {b.void_reason ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'returns' && returnsData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Credit Notes"
              value={returnsData.count}
              icon={<Receipt className="h-4 w-4" />}
            />
            <StatCard
              label="Total Returned"
              value={<PriceDisplay value={returnsData.total} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">CN No</th>
                  <th className="px-4 py-3 hidden md:table-cell">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 hidden md:table-cell">Orig. Invoice</th>
                  <th className="px-4 py-3 hidden md:table-cell">Reason</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returnsData.returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No sales returns in this period.
                    </td>
                  </tr>
                ) : (
                  returnsData.returns.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold">
                        {r.credit_note_no}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {r.credit_note_date}
                      </td>
                      <td className="px-4 py-3 font-medium">{r.customer_name ?? 'Walk-in'}</td>
                      <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">
                        {r.original_invoice_no ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground capitalize">
                        {r.reason}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={r.grand_total} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'discounts' && discountsData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Discounted Bills"
              value={discountsData.totals.invoice_count}
              icon={<Tag className="h-4 w-4" />}
            />
            <StatCard
              label="Total Discount Given"
              value={<PriceDisplay value={discountsData.totals.total_discount} />}
              icon={<DollarSign className="h-4 w-4" />}
              className="border-amber-200 bg-amber-50/50"
            />
            <StatCard
              label="Total Sales (discounted bills)"
              value={<PriceDisplay value={discountsData.totals.total_sales} />}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Avg Discount %"
              value={
                Number(discountsData.totals.total_sales) > 0
                  ? `${((Number(discountsData.totals.total_discount) / Number(discountsData.totals.total_sales)) * 100).toFixed(1)}%`
                  : '0%'
              }
              icon={<Tag className="h-4 w-4" />}
            />
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
              Discount by Item
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Qty</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">MRP Total</th>
                  <th className="px-4 py-3 text-right">Discount</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Disc %</th>
                </tr>
              </thead>
              <tbody>
                {discountsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No discounts given in this period.
                    </td>
                  </tr>
                ) : (
                  discountsData.items.map((it) => {
                    const discPct =
                      Number(it.total_before) > 0
                        ? ((Number(it.discount_amt) / Number(it.total_before)) * 100).toFixed(1)
                        : '0';
                    return (
                      <tr
                        key={it.item_id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium">{it.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                          {Number(it.qty).toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                          <PriceDisplay value={it.total_before} currency="" />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-amber-700">
                          <PriceDisplay value={it.discount_amt} currency="" />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">
                          {discPct}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'top_customers' && topCustData ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Invoices</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Last Purchase</th>
              </tr>
            </thead>
            <tbody>
              {topCustData.customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                topCustData.customers.map((c, idx) => (
                  <tr
                    key={c.customer_id ?? `walk-in-${idx}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums font-mono text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {c.invoice_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={c.total} currency="" />
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
      ) : subTab === 'day_book' && dayBookData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total Money In"
              value={<PriceDisplay value={dayBookData.totals.total_in} />}
              icon={<TrendingUp className="h-4 w-4" />}
              className="bg-emerald-500/5 border-emerald-500/20"
            />
            <StatCard
              label="Total Money Out"
              value={<PriceDisplay value={dayBookData.totals.total_out} />}
              icon={<Receipt className="h-4 w-4" />}
              className="bg-rose-500/5 border-rose-500/20"
            />
            <StatCard
              label="Net Cash Flow"
              value={<PriceDisplay value={dayBookData.totals.net} />}
              icon={<DollarSign className="h-4 w-4" />}
              className={
                Number(dayBookData.totals.net) >= 0
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-rose-500/5 border-rose-500/20'
              }
            />
            <StatCard
              label="Transactions"
              value={dayBookData.entries.length}
              icon={<FileSpreadsheet className="h-4 w-4" />}
            />
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 hidden md:table-cell">Ref No</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Party / Narration</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 hidden md:table-cell">Mode</th>
                </tr>
              </thead>
              <tbody>
                {dayBookData.entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No transactions in this period.
                    </td>
                  </tr>
                ) : (
                  dayBookData.entries.map((e, idx) => {
                    const isOut = e.type === 'sales_return' || e.type === 'payment_out';
                    const typeLabel: Record<string, string> = {
                      sale: 'Sale',
                      sales_return: 'Return',
                      payment_in: 'Received',
                      payment_out: 'Paid Out',
                    };
                    const typeBg: Record<string, string> = {
                      sale: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
                      sales_return:
                        'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
                      payment_in:
                        'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
                      payment_out:
                        'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
                    };
                    return (
                      <tr
                        key={`${e.ref_no}-${idx}`}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 tabular-nums font-mono text-xs text-muted-foreground">
                          {e.date}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                              typeBg[e.type] ?? 'bg-muted border-border',
                            )}
                          >
                            {typeLabel[e.type] ?? e.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs hidden md:table-cell">
                          {e.ref_no}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {e.party}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right tabular-nums font-semibold',
                            isOut
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {isOut ? '−' : '+'}
                          <PriceDisplay value={e.amount.replace('-', '')} currency="" />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                          {e.mode}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'margin' && marginData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total Revenue"
              value={<PriceDisplay value={marginData.totals.revenue} />}
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Total Cost"
              value={<PriceDisplay value={marginData.totals.cost} />}
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <StatCard
              label="Gross Profit"
              value={<PriceDisplay value={marginData.totals.gross_profit} />}
              icon={<DollarSign className="h-4 w-4" />}
              className="bg-emerald-500/5 border-emerald-500/20"
            />
            <StatCard
              label="Overall Margin"
              value={`${marginData.totals.overall_margin_pct}%`}
              icon={<Receipt className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
              Item Profitability — Top 200 by Gross Profit
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Qty Sold</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Cost</th>
                  <th className="px-4 py-3 text-right">Gross Profit</th>
                  <th className="px-4 py-3 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {marginData.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No sales data in this period.
                    </td>
                  </tr>
                ) : (
                  marginData.items.map((it, idx) => {
                    const mp = Number(it.margin_pct);
                    const marginColor =
                      mp >= 30
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : mp >= 10
                          ? 'text-sky-600 dark:text-sky-400'
                          : mp >= 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400';
                    return (
                      <tr
                        key={it.item_id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-muted-foreground tabular-nums font-mono text-xs">
                          {idx + 1}
                        </td>
                        <td className="px-4 py-3 font-medium">{it.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                          {it.qty_sold}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <PriceDisplay value={it.revenue} currency="" />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                          <PriceDisplay value={it.cost} currency="" />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          <PriceDisplay value={it.gross_profit} currency="" />
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right tabular-nums font-semibold',
                            marginColor,
                          )}
                        >
                          {it.margin_pct}%
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'salesperson' && salespersonData ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Salesperson</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Invoices</th>
                <th className="px-4 py-3 text-right">Revenue</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Avg Value</th>
                <th className="px-4 py-3 text-right hidden lg:table-cell">Collected</th>
              </tr>
            </thead>
            <tbody>
              {salespersonData.salespersons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                salespersonData.salespersons.map((s, idx) => (
                  <tr
                    key={s.salesperson_id ?? `unassigned-${idx}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums font-mono text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {s.name}
                      {!s.salesperson_id && (
                        <span className="ml-2 text-xs text-muted-foreground">(no salesperson)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {s.invoice_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={s.total} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden md:table-cell">
                      <PriceDisplay value={s.avg_value} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400 hidden lg:table-cell">
                      <PriceDisplay value={s.total_collected} currency="" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : subTab === 'by_category' && categoryData ? (
        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">SKUs Sold</th>
                <th className="px-4 py-3 text-right hidden md:table-cell">Qty</th>
                <th className="px-4 py-3 text-right hidden lg:table-cell">Discount</th>
                <th className="px-4 py-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {categoryData.categories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No sales in this period.
                  </td>
                </tr>
              ) : (
                categoryData.categories.map((c, idx) => (
                  <tr
                    key={c.category_id ?? `uncategorized-${idx}`}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums font-mono text-xs">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 font-medium">{c.category_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {c.item_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {c.qty}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400 hidden lg:table-cell">
                      <PriceDisplay value={c.discount} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      <PriceDisplay value={c.total} currency="" />
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

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.click();
  URL.revokeObjectURL(url);
}
