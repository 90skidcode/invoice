import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { ShareWhatsAppDialog } from '@/components/share-whatsapp-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type ColumnDef, DataTable } from '@/components/ui/data-table';
import { FilterSheet, FilterTrigger } from '@/components/ui/filter-sheet';
import { Input } from '@/components/ui/input';
import { DateDisplay, PriceDisplay } from '@/components/ui/price-display';
import { TablePagination } from '@/components/ui/table-pagination';
import { api } from '@/lib/api-client';
import { downloadCsv, mapWithConcurrency, toCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';
import { openInvoicePrint } from '@/lib/print';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Edit,
  IndianRupee,
  Printer,
  Receipt,
  Share2,
  Undo2,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

interface InvoiceRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string | null;
  grand_total: string;
  balance_due: string;
  status: string;
  payment_status: string;
  invoice_hash?: string;
  customer_id?: string | null;
}

interface ListResponse {
  data: InvoiceRow[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
}

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

interface ExportLine {
  line_no: number;
  item_name_snapshot: string | null;
  item_sku_snapshot: string | null;
  qty: string;
  rate: string;
  discount_pct: string;
  discount_amt: string;
  taxable_amt: string;
  gst_rate: string;
  total: string;
}

interface ExportInvoiceDetail {
  invoice_no: string;
  invoice_date: string;
  customer_name_snapshot: string | null;
  lines: ExportLine[];
}

// ─── Invoices List ────────────────────────────────────────────────────────────

export function InvoicesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  // Advanced filter state
  const [showAdvancedFilter, setShowAdvancedFilter] = React.useState(false);
  const [filterInvoiceNo, setFilterInvoiceNo] = React.useState('');
  const [filterCustomerName, setFilterCustomerName] = React.useState('');
  const [filterPhone, setFilterPhone] = React.useState('');
  const [filterPaymentStatus, setFilterPaymentStatus] = React.useState('');

  // Pagination state
  const [page, setPage] = React.useState(0);
  const pageSize = 20;

  const hasActiveFilters =
    !!filterInvoiceNo || !!filterCustomerName || !!filterPhone || !!filterPaymentStatus;

  const query = new URLSearchParams();
  if (from) query.set('date_from', from);
  if (to) query.set('date_to', to);
  if (filterInvoiceNo) query.set('invoice_no', filterInvoiceNo);
  if (filterCustomerName) query.set('customer_name', filterCustomerName);
  if (filterPhone) query.set('phone', filterPhone);
  if (filterPaymentStatus) query.set('payment_status', filterPaymentStatus);
  query.set('limit', String(pageSize));
  query.set('offset', String(page * pageSize));

  const { data: listData, isLoading, error } = useQuery<ListResponse>({
    queryKey: [
      'invoices',
      from,
      to,
      filterInvoiceNo,
      filterCustomerName,
      filterPhone,
      filterPaymentStatus,
      page,
    ],
    queryFn: () => api.get<ListResponse>(`/invoices?${query.toString()}`),
  });
  const invoices = listData?.data ?? [];
  const pageInfo = listData?.page;

  function clearAdvancedFilters() {
    setFilterInvoiceNo('');
    setFilterCustomerName('');
    setFilterPhone('');
    setFilterPaymentStatus('');
    setPage(0);
  }

  const [payingInvoice, setPayingInvoice] = React.useState<InvoiceRow | null>(null);
  const [activeShare, setActiveShare] = React.useState<InvoiceRow | null>(null);
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const rangeSuffix = [from, to].filter(Boolean).join('_to_') || new Date().toISOString().slice(0, 10);

  // Export 1 — the columns visible in the table, straight from the loaded list.
  function exportSummary() {
    setExportMenuOpen(false);
    const headers = ['Invoice #', 'Date', 'Customer', 'Total', 'Due', 'Payment Status', 'Status'];
    const rows = invoices.map((inv) => [
      inv.invoice_no,
      inv.invoice_date,
      inv.customer_name ?? 'Walk-in',
      inv.grand_total,
      inv.balance_due,
      inv.payment_status,
      inv.status,
    ]);
    downloadCsv(`invoices_${rangeSuffix}.csv`, toCsv(headers, rows));
  }

  // Export 2 — one row per line item, with count (qty) and discount.
  async function exportWithItems() {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      const details = await mapWithConcurrency(invoices, 6, async (inv) => ({
        row: inv,
        detail: await api.get<ExportInvoiceDetail>(`/invoices/${inv.id}`),
      }));
      const headers = [
        'Invoice #',
        'Date',
        'Customer',
        'Invoice Total',
        'Due',
        'Line #',
        'Item',
        'SKU',
        'Count (Qty)',
        'Rate',
        'Discount %',
        'Discount Amt',
        'Taxable',
        'GST %',
        'Line Total',
      ];
      const rows: unknown[][] = [];
      for (const { row, detail } of details) {
        for (const line of detail.lines) {
          rows.push([
            detail.invoice_no,
            detail.invoice_date,
            detail.customer_name_snapshot ?? 'Walk-in',
            row.grand_total,
            row.balance_due,
            line.line_no,
            line.item_name_snapshot ?? '',
            line.item_sku_snapshot ?? '',
            line.qty,
            line.rate,
            line.discount_pct,
            line.discount_amt,
            line.taxable_amt,
            line.gst_rate,
            line.total,
          ]);
        }
      }
      downloadCsv(`invoice_items_${rangeSuffix}.csv`, toCsv(headers, rows));
    } finally {
      setExporting(false);
    }
  }

  async function handleShareClick(inv: InvoiceRow) {
    if (!inv.customer_id) {
      setCustomerPhone('');
      setActiveShare(inv);
      return;
    }
    setLoadingId(inv.id);
    try {
      const c = await api.get<{ phone: string }>(`/customers/${inv.customer_id}`);
      setCustomerPhone(c.phone);
    } catch {
      setCustomerPhone('');
    } finally {
      setLoadingId(null);
      setActiveShare(inv);
    }
  }

  function handlePaymentSaved() {
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  }

  const canPay = (inv: InvoiceRow) =>
    Number(inv.balance_due) > 0 &&
    inv.status !== 'voided' &&
    inv.status !== 'fully_returned' &&
    !!inv.customer_id;

  const canEdit = (inv: InvoiceRow) =>
    inv.status !== 'voided' && inv.status !== 'fully_returned';

  const columns = React.useMemo<ColumnDef<InvoiceRow, unknown>[]>(
    () => [
      {
        id: 'invoice_no',
        header: 'Invoice #',
        cell: ({ row }) => (
          <>
            <button
              type="button"
              onClick={() => navigate(`/invoices/${row.original.id}`)}
              className="font-mono text-xs text-primary hover:underline underline-offset-2"
            >
              {row.original.invoice_no}
            </button>
            <div className="md:hidden text-xs text-muted-foreground mt-0.5">
              {row.original.customer_name ?? 'Walk-in'} · <DateDisplay value={row.original.invoice_date} />
            </div>
          </>
        ),
      },
      {
        id: 'date',
        header: 'Date',
        meta: { hideOnMobile: true },
        cell: ({ row }) => <DateDisplay value={row.original.invoice_date} />,
      },
      {
        id: 'customer',
        header: 'Customer',
        meta: { hideOnMobile: true },
        cell: ({ row }) => row.original.customer_name ?? 'Walk-in',
      },
      {
        id: 'total',
        header: 'Total',
        meta: { align: 'right', className: 'tabular-nums' },
        cell: ({ row }) => (
          <>
            <PriceDisplay value={row.original.grand_total} currency="" />
            {Number(row.original.balance_due) > 0 && (
              <div className="md:hidden text-xs text-destructive mt-0.5">
                Due ₹{row.original.balance_due}
              </div>
            )}
          </>
        ),
      },
      {
        id: 'due',
        header: 'Due',
        meta: { align: 'right', hideOnMobile: true, className: 'tabular-nums' },
        cell: ({ row }) =>
          Number(row.original.balance_due) > 0 ? (
            <PriceDisplay value={row.original.balance_due} currency="" className="text-destructive" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { align: 'center', hideOnMobile: true },
        cell: ({ row }) => (
          <StatusBadge status={row.original.status === 'voided' ? 'voided' : row.original.payment_status} />
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { align: 'right', className: 'w-36' },
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <div className="flex items-center justify-end gap-0.5">
              {canPay(inv) && (
                <button
                  type="button"
                  title="Record payment"
                  aria-label="Record payment"
                  onClick={() => setPayingInvoice(inv)}
                  className="flex h-7 w-7 items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                >
                  <IndianRupee className="h-3.5 w-3.5" />
                </button>
              )}
              {canEdit(inv) && (
                <button
                  type="button"
                  title="Edit invoice"
                  aria-label="Edit invoice"
                  onClick={() => navigate(`/billing?edit=${inv.id}`)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Edit className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                title="Print"
                aria-label="Print invoice"
                onClick={() => openInvoicePrint(inv.id, 'a4')}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Share on WhatsApp"
                aria-label="Share on WhatsApp"
                onClick={() => handleShareClick(inv)}
                disabled={loadingId === inv.id}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
              {canEdit(inv) && (
                <button
                  type="button"
                  title="Return / credit note"
                  aria-label="Return invoice"
                  onClick={() => navigate(`/returns/${inv.id}`)}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [loadingId, navigate],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Invoices</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setExportMenuOpen((open) => !open)}
              loading={exporting}
              disabled={invoices.length === 0 || isLoading}
              iconLeft={exporting ? undefined : <Download className="h-4 w-4" />}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
            >
              Export
            </Button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  aria-hidden="true"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-border bg-background py-1 shadow-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={exportSummary}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="block">Invoice list</span>
                    <span className="block text-xs text-muted-foreground">Visible table columns</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={exportWithItems}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="block">Invoice list with items</span>
                    <span className="block text-xs text-muted-foreground">
                      One row per item, with count &amp; discount
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
          <Button
            variant="primary"
            onClick={() => navigate('/billing')}
            iconLeft={<Receipt className="h-4 w-4" />}
          >
            New Invoice
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">From</span>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">To</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <FilterTrigger
          active={hasActiveFilters}
          onOpen={() => setShowAdvancedFilter(true)}
          onClear={clearAdvancedFilters}
        />
      </div>

      <FilterSheet
        open={showAdvancedFilter}
        onOpenChange={setShowAdvancedFilter}
        description="Narrow down invoices by number, customer details, and payment status"
        hasActiveFilters={hasActiveFilters}
        onClear={clearAdvancedFilters}
      >
        <div>
          <label htmlFor="filter-invoice-no" className="text-sm font-medium mb-1.5 block">
            Invoice Number
          </label>
          <Input
            id="filter-invoice-no"
            placeholder="Search invoice number…"
            value={filterInvoiceNo}
            onChange={(e) => {
              setFilterInvoiceNo(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div>
          <label htmlFor="filter-customer-name" className="text-sm font-medium mb-1.5 block">
            Customer Name
          </label>
          <Input
            id="filter-customer-name"
            placeholder="Search customer name…"
            value={filterCustomerName}
            onChange={(e) => {
              setFilterCustomerName(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div>
          <label htmlFor="filter-phone" className="text-sm font-medium mb-1.5 block">
            Phone Number
          </label>
          <Input
            id="filter-phone"
            placeholder="Search phone…"
            value={filterPhone}
            onChange={(e) => {
              setFilterPhone(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <div>
          <div className="text-sm font-medium mb-1.5">Payment Status</div>
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 border border-border">
            {PAYMENT_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setFilterPaymentStatus(opt.value);
                  setPage(0);
                }}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
                  filterPaymentStatus === opt.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </FilterSheet>

      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        error={error}
        errorMessage="Failed to load invoices"
        emptyIcon={<Receipt className="h-10 w-10 opacity-30" />}
        emptyTitle="No invoices"
        emptyDescription="Ring up a sale in Billing to see it here"
        getRowId={(row) => row.id}
      />

      {pageInfo && <TablePagination page={pageInfo} onPageChange={(offset) => setPage(offset / pageSize)} />}

      {payingInvoice && (
        <RecordPaymentDialog
          invoice={{
            id: payingInvoice.id,
            invoice_no: payingInvoice.invoice_no,
            customer_id: payingInvoice.customer_id ?? null,
            customer_name: payingInvoice.customer_name,
            grand_total: payingInvoice.grand_total,
            balance_due: payingInvoice.balance_due,
          }}
          onClose={() => setPayingInvoice(null)}
          onSaved={handlePaymentSaved}
        />
      )}

      {activeShare && (
        <ShareWhatsAppDialog
          open={!!activeShare}
          onOpenChange={(open) => { if (!open) setActiveShare(null); }}
          invoiceNo={activeShare.invoice_no}
          grandTotal={activeShare.grand_total}
          invoiceHash={activeShare.invoice_hash || ''}
          defaultPhone={customerPhone}
          customerName={activeShare.customer_name || ''}
        />
      )}
    </div>
  );
}
