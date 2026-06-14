import { ShareWhatsAppDialog } from '@/components/share-whatsapp-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateDisplay, PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { openInvoicePrint } from '@/lib/print';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { Check, Edit, IndianRupee, Printer, Receipt, Share2, Undo2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

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
  invoice: InvoiceRow;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const [amount, setAmount] = React.useState(invoice.balance_due);
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
  const amountDecimal = new Decimal(amount || '0');
  const amountValid =
    amountDecimal.gt(0) && amountDecimal.lte(maxAmount);

  async function handleSave() {
    if (!amountValid) {
      setError(`Amount must be between ₹0.01 and ₹${invoice.balance_due}`);
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
        amount: amountDecimal.toFixed(2),
        mode,
        account_id: accountId || null,
        reference: reference || null,
        allocations: [{ invoice_id: invoice.id, amount: amountDecimal.toFixed(2) }],
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
        description={`${invoice.customer_name ?? 'Walk-in'} · Total ₹${invoice.grand_total} · Due ₹${invoice.balance_due}`}
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
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Amount
                </span>
                <Input
                  type="number"
                  prefix="₹"
                  step="0.01"
                  min="0.01"
                  max={invoice.balance_due}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Mode
                </span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PayMode)}
                >
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Deposit To
                </span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {(accounts ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Reference
                </span>
                <Input
                  placeholder="UTR / UPI ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
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
        )}
      </DialogContent>
    </Dialog>
  );
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Invoices</h1>
        <Button
          variant="primary"
          onClick={() => navigate('/billing')}
          iconLeft={<Receipt className="h-4 w-4" />}
        >
          New Invoice
        </Button>
      </div>

      <div className="flex items-end gap-3">
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
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Due</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">{inv.invoice_no}</td>
                  <td className="px-4 py-2.5">
                    <DateDisplay value={inv.invoice_date} />
                  </td>
                  <td className="px-4 py-2.5">{inv.customer_name ?? 'Walk-in'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <PriceDisplay value={inv.grand_total} currency="" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {Number(inv.balance_due) > 0 ? (
                      <PriceDisplay
                        value={inv.balance_due}
                        currency=""
                        className="text-destructive"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={inv.status === 'voided' ? 'voided' : inv.payment_status} />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {canPay(inv) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<IndianRupee className="h-3.5 w-3.5" />}
                        onClick={() => setPayingInvoice(inv)}
                      >
                        Pay
                      </Button>
                    )}
                    {inv.status !== 'voided' && inv.status !== 'fully_returned' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Edit className="h-3.5 w-3.5" />}
                        onClick={() => navigate(`/billing?edit=${inv.id}`)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Printer className="h-3.5 w-3.5" />}
                      onClick={() => openInvoicePrint(inv.id, 'a4')}
                    >
                      Print
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Share2 className="h-3.5 w-3.5" />}
                      loading={loadingId === inv.id}
                      onClick={() => handleShareClick(inv)}
                    >
                      Share
                    </Button>
                    {inv.status !== 'voided' && inv.status !== 'fully_returned' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Undo2 className="h-3.5 w-3.5" />}
                        onClick={() => navigate(`/returns/${inv.id}`)}
                      >
                        Return
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payingInvoice && (
        <RecordPaymentDialog
          invoice={payingInvoice}
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
