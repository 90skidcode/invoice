import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { ShareWhatsAppDialog } from '@/components/share-whatsapp-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateDisplay, PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { downloadCsv, mapWithConcurrency, toCsv } from '@/lib/csv';
import { openInvoicePrint } from '@/lib/print';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Edit, IndianRupee, Printer, Receipt, Share2, Undo2 } from 'lucide-react';
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

  const query = new URLSearchParams();
  if (from) query.set('date_from', from);
  if (to) query.set('date_to', to);

  const { data, isLoading, error } = useQuery<InvoiceRow[]>({
    queryKey: ['invoices', from, to],
    queryFn: () => api.get<InvoiceRow[]>(`/invoices?${query.toString()}`),
  });
  const invoices = data ?? [];

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
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">
            Failed to load invoices
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-30" />
            <p className="font-medium">No invoices</p>
            <p className="text-sm">Ring up a sale in Billing to see it here</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Invoice #</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Customer</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Due</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground hidden md:table-cell">Status</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-36">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="font-mono text-xs text-primary hover:underline underline-offset-2"
                    >
                      {inv.invoice_no}
                    </button>
                    {/* Show customer + date inline on mobile */}
                    <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                      {inv.customer_name ?? 'Walk-in'} · <DateDisplay value={inv.invoice_date} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">
                    <DateDisplay value={inv.invoice_date} />
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell">{inv.customer_name ?? 'Walk-in'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <PriceDisplay value={inv.grand_total} currency="" />
                    {/* Show due + status inline on mobile */}
                    {Number(inv.balance_due) > 0 && (
                      <div className="md:hidden text-xs text-destructive mt-0.5">Due ₹{inv.balance_due}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">
                    {Number(inv.balance_due) > 0 ? (
                      <PriceDisplay value={inv.balance_due} currency="" className="text-destructive" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <StatusBadge status={inv.status === 'voided' ? 'voided' : inv.payment_status} />
                  </td>
                  <td className="px-4 py-2 text-right">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
