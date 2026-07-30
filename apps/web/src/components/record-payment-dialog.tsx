import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { usePaymentModes } from '@/hooks/use-payment-modes';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { Check, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { uuidv7 } from 'uuidv7';

interface BankAccount {
  id: string;
  name: string;
  type: string;
  is_default: boolean;
}

export interface RecordPaymentInvoice {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  customer_name: string | null;
  grand_total: string;
  balance_due: string;
}

interface PaymentEntry {
  id: string;
  mode: string;
  amount: string;
  reference: string | null;
}

// Fallback if the org hasn't configured any payment modes yet
const DEFAULT_MODES = [
  { id: '', name: 'Cash', type: 'cash', badge_color: 'bg-green-100 text-green-800' },
  { id: '', name: 'UPI', type: 'upi', badge_color: 'bg-blue-100 text-blue-800' },
  { id: '', name: 'Card', type: 'card', badge_color: 'bg-purple-100 text-purple-800' },
  { id: '', name: 'Bank Transfer', type: 'bank', badge_color: 'bg-amber-100 text-amber-800' },
  { id: '', name: 'Cheque', type: 'cheque', badge_color: 'bg-slate-100 text-slate-800' },
];

export function RecordPaymentDialog({
  invoice,
  onClose,
  onSaved,
}: Readonly<{
  invoice: RecordPaymentInvoice;
  onClose: () => void;
  onSaved: () => void;
}>) {
  const { data: paymentModes } = usePaymentModes();
  const modes = paymentModes && paymentModes.length > 0 ? paymentModes : DEFAULT_MODES;

  const { data: accounts } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get<BankAccount[]>('/bank-accounts'),
  });

  const [accountId, setAccountId] = React.useState('');
  const [entries, setEntries] = React.useState<PaymentEntry[]>([]);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formMode, setFormMode] = React.useState('cash');
  const [formAmount, setFormAmount] = React.useState('');
  const [formReference, setFormReference] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!accountId && accounts && accounts.length > 0) {
      setAccountId(accounts.find((a) => a.is_default)?.id ?? accounts[0]!.id);
    }
  }, [accounts, accountId]);

  React.useEffect(() => {
    if (modes.length > 0 && !modes.some((m) => m.type === formMode)) {
      setFormMode(modes[0]!.type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modes]);

  const balanceDue = new Decimal(invoice.balance_due);
  const paidSoFar = new Decimal(invoice.grand_total).minus(balanceDue);
  const totalEntered = entries.reduce((sum, e) => sum.plus(new Decimal(e.amount || '0')), new Decimal('0'));
  const remaining = balanceDue.minus(totalEntered);

  function getModeLabel(mode: string) {
    return modes.find((m) => m.type === mode)?.name ?? mode;
  }

  function getModeColor(mode: string) {
    return modes.find((m) => m.type === mode)?.badge_color ?? 'bg-gray-100 text-gray-800';
  }

  function resetForm() {
    setShowAddForm(false);
    setEditingId(null);
    setFormAmount('');
    setFormReference('');
    setError(null);
  }

  function handleAddEntry() {
    if (!formAmount || new Decimal(formAmount).lte(0)) return;
    const amt = new Decimal(formAmount);
    const editingEntry = editingId ? entries.find((e) => e.id === editingId) : undefined;
    const availableForThis = editingEntry ? remaining.plus(editingEntry.amount) : remaining;

    if (amt.gt(availableForThis)) {
      setError(`Amount exceeds remaining balance of ₹${availableForThis.toFixed(2)}`);
      return;
    }

    if (editingId) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === editingId
            ? { ...e, mode: formMode, amount: amt.toFixed(2), reference: formReference || null }
            : e,
        ),
      );
    } else {
      setEntries((prev) => [
        ...prev,
        { id: uuidv7(), mode: formMode, amount: amt.toFixed(2), reference: formReference || null },
      ]);
    }
    resetForm();
  }

  function handleEditEntry(entry: PaymentEntry) {
    setFormMode(entry.mode);
    setFormAmount(entry.amount);
    setFormReference(entry.reference ?? '');
    setEditingId(entry.id);
    setShowAddForm(true);
    setError(null);
  }

  function handleRemoveEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function handlePayFullBalance() {
    if (remaining.lte(0)) return;
    setEntries((prev) => [
      ...prev,
      { id: uuidv7(), mode: modes[0]?.type ?? 'cash', amount: remaining.toFixed(2), reference: null },
    ]);
  }

  async function handleSave() {
    if (entries.length === 0) {
      setError('Add at least one payment');
      return;
    }
    if (totalEntered.lte(0) || totalEntered.gt(balanceDue)) {
      setError(`Total payment must be between ₹0.01 and ₹${invoice.balance_due}`);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      for (const entry of entries) {
        await api.post('/payments', {
          client_id: uuidv7(),
          payment_date: new Date().toISOString().slice(0, 10),
          direction: 'inbound',
          party_type: 'customer',
          party_id: invoice.customer_id,
          amount: entry.amount,
          mode: entry.mode,
          account_id: accountId || null,
          reference: entry.reference,
          allocations: [{ invoice_id: invoice.id, amount: entry.amount }],
        });
      }
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
      <DialogContent size="sm" title={`Record Payment — ${invoice.invoice_no}`}>
        {saved ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
              <Check className="h-6 w-6 text-success" />
            </div>
            <p className="font-medium">Payment recorded</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Invoice summary */}
            <div className="space-y-1 rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{invoice.customer_name ?? 'Walk-in'}</span>
                <PriceDisplay value={invoice.grand_total} />
              </div>
              {paidSoFar.gt(0) && (
                <div className="flex justify-between text-success">
                  <span>Already Paid</span>
                  <span>-<PriceDisplay value={paidSoFar.toFixed(2)} /></span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <span>Balance Due</span>
                <PriceDisplay value={invoice.balance_due} />
              </div>
            </div>

            {/* Entries list */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Payments ({entries.length})</h3>
              <span className={`text-sm font-medium ${remaining.gt(0) ? 'text-destructive' : 'text-success'}`}>
                Remaining: <PriceDisplay value={remaining.toFixed(2)} />
              </span>
            </div>

            {entries.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No payments added yet
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card p-2.5"
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${getModeColor(entry.mode)}`}>
                        {getModeLabel(entry.mode)}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          <PriceDisplay value={entry.amount} />
                        </div>
                        {entry.reference && (
                          <div className="text-xs text-muted-foreground">{entry.reference}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleEditEntry(entry)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveEntry(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add payment form */}
            {!showAddForm ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowAddForm(true)}
                  disabled={remaining.lte(0)}
                >
                  <Plus className="mr-2 h-4 w-4" /> Add Payment
                </Button>
                {remaining.gt(0) && (
                  <Button type="button" variant="outline" onClick={handlePayFullBalance}>
                    Pay Full (₹{remaining.toFixed(2)})
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-border bg-card p-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Mode
                    </span>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formMode}
                      onChange={(e) => setFormMode(e.target.value)}
                    >
                      {modes.map((m) => (
                        <option key={m.type} value={m.type}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Amount (max ₹
                      {(editingId
                        ? remaining.plus(entries.find((e) => e.id === editingId)?.amount ?? '0')
                        : remaining
                      ).toFixed(2)}
                      )
                    </span>
                    <Input
                      type="number"
                      prefix="₹"
                      step="0.01"
                      min="0.01"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      autoFocus
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Reference <span className="font-normal normal-case">(optional — e.g. Dhanrani UPI)</span>
                  </span>
                  <Input
                    placeholder="e.g. UTR123456"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleAddEntry}
                    disabled={!formAmount || new Decimal(formAmount || '0').lte(0)}
                  >
                    {editingId ? 'Update' : 'Add'}
                  </Button>
                </div>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">
                Collecting <span className="font-semibold text-foreground">₹{totalEntered.toFixed(2)}</span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={entries.length === 0 || totalEntered.lte(0) || totalEntered.gt(balanceDue)}
                  iconLeft={saving ? undefined : <Check className="h-4 w-4" />}
                  onClick={handleSave}
                >
                  Save Payment{entries.length > 1 ? 's' : ''}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
