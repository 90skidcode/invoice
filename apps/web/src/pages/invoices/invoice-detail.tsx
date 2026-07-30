import { RecordPaymentDialog } from '@/components/record-payment-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateDisplay, PriceDisplay, QuantityDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { openInvoicePrint } from '@/lib/print';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import {
  ArrowLeft,
  Edit,
  IndianRupee,
  Printer,
  Undo2,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLine {
  id: string;
  line_no: number;
  item_name_snapshot: string | null;
  item_sku_snapshot: string | null;
  hsn_code: string | null;
  qty: string;
  rate: string;
  discount_pct: string;
  discount_amt: string;
  taxable_amt: string;
  gst_rate: string;
  cgst_amt: string;
  sgst_amt: string;
  igst_amt: string;
  total: string;
  is_free: boolean;
}

interface InvoiceDetail {
  id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  customer_gstin_snapshot: string | null;
  billing_address_snapshot: Record<string, string> | null;
  place_of_supply: string;
  reference_no: string | null;
  status: string;
  payment_status: string;
  subtotal: string;
  discount_total: string;
  taxable_total: string;
  cgst_total: string;
  sgst_total: string;
  igst_total: string;
  cess_total: string;
  other_charges: string;
  round_off: string;
  grand_total: string;
  amount_paid: string;
  balance_due: string;
  notes: string | null;
  void_reason: string | null;
  amount_in_words: string;
  lines: InvoiceLine[];
}

// ─── Totals Row ───────────────────────────────────────────────────────────────

function TotalRow({
  label,
  value,
  bold,
  className,
}: Readonly<{ label: string; value: string; bold?: boolean; className?: string }>) {
  return (
    <div className={`flex justify-between py-1 text-sm ${bold ? 'font-semibold' : ''} ${className ?? ''}`}>
      <span className={bold ? '' : 'text-muted-foreground'}>{label}</span>
      <PriceDisplay value={value} className={bold ? 'text-base' : ''} />
    </div>
  );
}

// ─── Invoice Detail Page ──────────────────────────────────────────────────────

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPayDialog, setShowPayDialog] = React.useState(false);

  const { data: invoice, isLoading, error, refetch } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <p className="text-destructive">Failed to load invoice.</p>
        <Button variant="outline" onClick={() => navigate('/invoices')}>
          Back to Invoices
        </Button>
      </div>
    );
  }

  const canPay =
    Number(invoice.balance_due) > 0 &&
    invoice.status !== 'voided' &&
    invoice.status !== 'fully_returned' &&
    !!invoice.customer_id;

  const canEdit = invoice.status !== 'voided' && invoice.status !== 'fully_returned';

  const hasTax =
    Number(invoice.cgst_total) > 0 ||
    Number(invoice.sgst_total) > 0 ||
    Number(invoice.igst_total) > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/invoices')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Invoices
        </button>
        <div className="flex items-center gap-2">
          {canPay && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<IndianRupee className="h-4 w-4" />}
              onClick={() => setShowPayDialog(true)}
            >
              Record Payment
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Edit className="h-4 w-4" />}
              onClick={() => navigate(`/billing?edit=${invoice.id}`)}
            >
              Edit
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Undo2 className="h-4 w-4" />}
              onClick={() => navigate(`/returns/${invoice.id}`)}
            >
              Return
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Printer className="h-4 w-4" />}
            onClick={() => openInvoicePrint(invoice.id, 'a4')}
          >
            Print
          </Button>
        </div>
      </div>

      {/* Invoice card */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-muted/30 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Invoice</p>
              <h1 className="text-2xl font-bold font-mono">{invoice.invoice_no}</h1>
              {invoice.reference_no && (
                <p className="text-xs text-muted-foreground mt-1">Ref: {invoice.reference_no}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge
                status={invoice.status === 'voided' ? 'voided' : invoice.payment_status}
                className="text-sm px-3 py-1"
              />
              {invoice.status === 'voided' && invoice.void_reason && (
                <p className="text-xs text-muted-foreground max-w-xs text-right">
                  Void reason: {invoice.void_reason}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Invoice Date</p>
              <p className="text-sm font-medium mt-0.5">
                <DateDisplay value={invoice.invoice_date} />
              </p>
            </div>
            {invoice.due_date && (
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="text-sm font-medium mt-0.5">
                  <DateDisplay value={invoice.due_date} />
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="text-sm font-medium mt-0.5">
                {invoice.customer_name_snapshot ?? <span className="text-muted-foreground">Walk-in</span>}
              </p>
              {invoice.customer_gstin_snapshot && (
                <p className="text-xs text-muted-foreground font-mono">{invoice.customer_gstin_snapshot}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Place of Supply</p>
              <p className="text-sm font-medium mt-0.5">{invoice.place_of_supply}</p>
            </div>
          </div>
        </div>

        {/* Line items */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Item</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">HSN</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Qty</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Rate</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Disc</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Taxable</th>
                {hasTax && (
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">GST</th>
                )}
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => {
                const gstAmt = new Decimal(line.cgst_amt)
                  .plus(line.sgst_amt)
                  .plus(line.igst_amt)
                  .toFixed(2);
                return (
                  <tr key={line.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-muted-foreground text-xs">{line.line_no}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{line.item_name_snapshot ?? '—'}</p>
                      {line.item_sku_snapshot && (
                        <p className="text-xs text-muted-foreground font-mono">{line.item_sku_snapshot}</p>
                      )}
                      {line.is_free && (
                        <span className="text-xs text-success font-medium">FREE</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground font-mono">
                      {line.hsn_code ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <QuantityDisplay value={line.qty} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <PriceDisplay value={line.rate} currency="" />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {Number(line.discount_amt) > 0 ? (
                        <PriceDisplay value={line.discount_amt} currency="" />
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <PriceDisplay value={line.taxable_amt} currency="" />
                    </td>
                    {hasTax && (
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        <PriceDisplay value={gstAmt} currency="" />
                        <span className="ml-1 text-xs">({line.gst_rate}%)</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      <PriceDisplay value={line.total} currency="" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals + Payment status */}
        <div className="border-t border-border px-6 py-5">
          <div className="flex flex-col-reverse gap-6 sm:flex-row sm:justify-between">
            {/* Amount in words + notes */}
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Amount in Words</p>
                <p className="text-sm italic text-foreground">{invoice.amount_in_words}</p>
              </div>
              {invoice.notes && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-foreground whitespace-pre-line">{invoice.notes}</p>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="w-full sm:w-72 shrink-0">
              <TotalRow label="Subtotal" value={invoice.subtotal} />
              {Number(invoice.discount_total) > 0 && (
                <TotalRow label="Discount" value={`-${invoice.discount_total}`} />
              )}
              {hasTax && (
                <TotalRow label="Taxable Amount" value={invoice.taxable_total} />
              )}
              {Number(invoice.cgst_total) > 0 && (
                <TotalRow label="CGST" value={invoice.cgst_total} />
              )}
              {Number(invoice.sgst_total) > 0 && (
                <TotalRow label="SGST" value={invoice.sgst_total} />
              )}
              {Number(invoice.igst_total) > 0 && (
                <TotalRow label="IGST" value={invoice.igst_total} />
              )}
              {Number(invoice.cess_total) > 0 && (
                <TotalRow label="Cess" value={invoice.cess_total} />
              )}
              {Number(invoice.other_charges) > 0 && (
                <TotalRow label="Other Charges" value={invoice.other_charges} />
              )}
              {Number(invoice.round_off) !== 0 && (
                <TotalRow label="Round Off" value={invoice.round_off} />
              )}
              <div className="my-2 border-t border-border" />
              <TotalRow label="Grand Total" value={invoice.grand_total} bold />
              <div className="my-2 border-t border-border border-dashed" />
              <TotalRow label="Amount Paid" value={invoice.amount_paid} />
              <TotalRow
                label="Balance Due"
                value={invoice.balance_due}
                bold={Number(invoice.balance_due) > 0}
                className={Number(invoice.balance_due) > 0 ? 'text-destructive' : ''}
              />
            </div>
          </div>
        </div>
      </div>

      {showPayDialog && (
        <RecordPaymentDialog
          invoice={{
            id: invoice.id,
            invoice_no: invoice.invoice_no,
            customer_id: invoice.customer_id,
            customer_name: invoice.customer_name_snapshot,
            grand_total: invoice.grand_total,
            balance_due: invoice.balance_due,
          }}
          onClose={() => setShowPayDialog(false)}
          onSaved={() => {
            void refetch();
            void queryClient.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}
    </div>
  );
}
