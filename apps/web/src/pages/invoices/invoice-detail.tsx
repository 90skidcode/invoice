import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateDisplay, PriceDisplay, QuantityDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { openInvoicePrint } from '@/lib/print';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import {
  ArrowLeft,
  Check,
  Edit,
  IndianRupee,
  Printer,
  Undo2,
} from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

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

interface BankAccount {
  id: string;
  name: string;
  type: string;
  is_default: boolean;
}

const MODES = ['cash', 'upi', 'card', 'bank', 'cheque'] as const;
type PayMode = (typeof MODES)[number];

// ─── Record Payment Dialog ────────────────────────────────────────────────────

function RecordPaymentDialog({
  invoice,
  onClose,
  onSaved,
}: Readonly<{
  invoice: InvoiceDetail;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [paymentType, setPaymentType] = React.useState<'full' | 'partial'>('full');
  const [partialAmount, setPartialAmount] = React.useState('');
  const [mode, setMode] = React.useState<PayMode>('cash');
  const [reference, setReference] = React.useState('');
  const [accountId, setAccountId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: accounts } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get<BankAccount[]>('/bank-accounts'),
  });

  React.useEffect(() => {
    if (!accountId && accounts && accounts.length > 0) {
      setAccountId(accounts.find((a) => a.is_default)?.id ?? accounts[0]!.id);
    }
  }, [accounts, accountId]);

  const maxAmount = new Decimal(invoice.balance_due);
  const effectiveAmount =
    paymentType === 'full' ? maxAmount : new Decimal(partialAmount || '0');
  const amountValid = effectiveAmount.gt(0) && effectiveAmount.lte(maxAmount);

  async function handleSave() {
    if (!amountValid) {
      setError(`Enter an amount between ₹0.01 and ₹${invoice.balance_due}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.post('/payments', {
        client_id: uuidv7(),
        payment_date: new Date().toISOString().slice(0, 10),
        direction: 'inbound',
        party_type: 'customer',
        party_id: invoice.customer_id,
        amount: effectiveAmount.toFixed(2),
        mode,
        account_id: accountId || null,
        reference: reference || null,
        allocations: [{ invoice_id: invoice.id, amount: effectiveAmount.toFixed(2) }],
      });
      setSaved(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        size="sm"
        title={`Record Payment — ${invoice.invoice_no}`}
        description={`${invoice.customer_name_snapshot ?? 'Walk-in'} · Due ₹${invoice.balance_due}`}
      >
        {saved ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Check className="h-6 w-6 text-success" />
            </div>
            <p className="font-medium">Payment recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setPaymentType('full')}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  paymentType === 'full'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Full — ₹{invoice.balance_due}
              </button>
              <button
                type="button"
                onClick={() => { setPaymentType('partial'); setPartialAmount(''); }}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  paymentType === 'partial'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Partial
              </button>
            </div>

            {paymentType === 'partial' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Amount (max ₹{invoice.balance_due})
                </span>
                <Input
                  type="number"
                  prefix="₹"
                  step="0.01"
                  min="0.01"
                  max={invoice.balance_due}
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                  autoFocus
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Mode</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PayMode)}
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>{m.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">Deposit To</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Reference <span className="normal-case font-normal">(optional)</span>
              </span>
              <Input
                placeholder="UTR / UPI ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center justify-between pt-1">
              <p className="text-sm text-muted-foreground">
                Collecting{' '}
                <span className="font-semibold text-foreground">
                  ₹{paymentType === 'full' ? invoice.balance_due : (partialAmount || '0.00')}
                </span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={!amountValid}
                  iconLeft={saving ? undefined : <Check className="h-4 w-4" />}
                  onClick={handleSave}
                >
                  Save Payment
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
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
          invoice={invoice}
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
