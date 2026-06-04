import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { Decimal } from 'decimal.js';
import { Check, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay, DateDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';

interface CustomerLookupResult {
  id: string;
  name: string;
  phone: string;
  credit_status: string;
  balance_due: string;
}

interface OpenInvoice {
  id: string;
  invoice_no: string;
  invoice_date: string;
  grand_total: string;
  balance_due: string;
  due_date: string | null;
}

interface Outstanding {
  balance_due: string;
  credit_limit: string;
  credit_status: string;
  open_invoices: OpenInvoice[];
}

interface BankAccount {
  id: string;
  name: string;
  type: string;
  is_default: boolean;
}

interface PaymentRow {
  id: string;
  payment_no: string;
  payment_date: string;
  amount: string;
  mode: string;
  reference: string | null;
  is_voided: boolean;
}

const MODES = ['cash', 'upi', 'card', 'bank', 'cheque'] as const;

function CustomerPicker({
  selected,
  onSelect,
  onClear,
}: Readonly<{
  selected: CustomerLookupResult | null;
  onSelect: (c: CustomerLookupResult) => void;
  onClear: () => void;
}>) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const { data } = useQuery<CustomerLookupResult[]>({
    queryKey: ['customer-lookup', query],
    queryFn: () => api.get<CustomerLookupResult[]>(`/customers/lookup?q=${encodeURIComponent(query)}`),
    enabled: open && query.length >= 2,
  });
  const results = data ?? [];

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 h-9 text-sm">
        <span className="font-medium">{selected.name}</span>
        <span className="text-xs text-muted-foreground">{selected.phone}</span>
        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:underline"
          onClick={onClear}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search customer…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(c);
                setOpen(false);
              }}
            >
              <span>{c.name} <span className="text-xs text-muted-foreground">{c.phone}</span></span>
              {Number(c.balance_due) > 0 && (
                <span className="text-xs text-muted-foreground">Due ₹{c.balance_due}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReceiptPage() {
  const [customer, setCustomer] = React.useState<CustomerLookupResult | null>(null);
  const [mode, setMode] = React.useState<(typeof MODES)[number]>('cash');
  const [accountId, setAccountId] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [allocations, setAllocations] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<{ payment_no: string; allocated: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data: accounts } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api.get<BankAccount[]>('/bank-accounts'),
  });

  // Default to the default (cash) account once loaded.
  React.useEffect(() => {
    if (!accountId && accounts && accounts.length > 0) {
      setAccountId(accounts.find((a) => a.is_default)?.id ?? accounts[0]!.id);
    }
  }, [accounts, accountId]);

  const { data: recent, refetch: refetchRecent } = useQuery<PaymentRow[]>({
    queryKey: ['payments-recent'],
    queryFn: () => api.get<PaymentRow[]>('/payments?direction=inbound&limit=10'),
  });

  const { data: outstanding, isLoading, refetch } = useQuery<Outstanding>({
    queryKey: ['customer-outstanding', customer?.id],
    queryFn: () => api.get<Outstanding>(`/customers/${customer!.id}/outstanding`),
    enabled: !!customer,
  });

  const openInvoices = outstanding?.open_invoices ?? [];

  const totalAllocated = React.useMemo(
    () =>
      Object.values(allocations)
        .reduce((acc, v) => acc.plus(new Decimal(v || '0')), new Decimal('0'))
        .toFixed(2),
    [allocations],
  );

  function setAlloc(invoiceId: string, value: string) {
    setAllocations((prev) => ({ ...prev, [invoiceId]: value }));
  }

  function allocateAll() {
    const next: Record<string, string> = {};
    for (const inv of openInvoices) next[inv.id] = inv.balance_due;
    setAllocations(next);
  }

  async function handleSave() {
    setError(null);
    if (!customer) {
      setError('Select a customer.');
      return;
    }
    const allocs = Object.entries(allocations)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([invoice_id, amount]) => ({ invoice_id, amount: new Decimal(amount).toFixed(2) }));
    if (allocs.length === 0) {
      setError('Allocate the receipt to at least one invoice.');
      return;
    }

    setSaving(true);
    try {
      const result = await api.post<{ payment_no: string; allocated: string }>('/payments', {
        client_id: uuidv7(),
        payment_date: today,
        direction: 'inbound',
        party_type: 'customer',
        party_id: customer.id,
        amount: totalAllocated,
        mode,
        account_id: accountId || null,
        reference: reference || null,
        allocations: allocs,
      });
      setSaved(result);
      setAllocations({});
      setReference('');
      await refetchRecent();
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save receipt');
    } finally {
      setSaving(false);
    }
  }

  async function handleVoid(id: string) {
    const reason = window.prompt('Reason for voiding this receipt?');
    if (!reason) return;
    try {
      await api.post(`/payments/${id}/void`, { reason });
      await refetchRecent();
      if (customer) await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to void receipt');
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Receipt</h1>

      {saved && (
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-3 text-sm">
          <Check className="h-4 w-4 text-success" />
          <span>
            Receipt <strong>{saved.payment_no}</strong> recorded — ₹{saved.allocated} allocated
          </span>
          <button
            className="ml-auto text-xs text-muted-foreground hover:underline"
            onClick={() => setSaved(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 rounded-lg border border-border bg-card p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </span>
          <CustomerPicker selected={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mode
          </span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as (typeof MODES)[number])}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
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
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Reference
          </span>
          <Input
            placeholder="UTR / cheque / UPI ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
      </div>

      {customer && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="font-semibold text-sm">
              Open Invoices
              {outstanding && (
                <span className="ml-2 font-normal text-muted-foreground">
                  Total due <PriceDisplay value={outstanding.balance_due} />
                </span>
              )}
            </h2>
            <Button variant="ghost" size="sm" onClick={allocateAll} disabled={openInvoices.length === 0}>
              Allocate All
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : openInvoices.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No open invoices — nothing to settle.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Invoice</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Outstanding
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground w-36">
                    Allocate
                  </th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{inv.invoice_no}</td>
                    <td className="px-4 py-2">
                      <DateDisplay value={inv.invoice_date} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <PriceDisplay value={inv.grand_total} currency="" />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <PriceDisplay value={inv.balance_due} currency="" />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        className="h-8 text-right tabular-nums"
                        prefix="₹"
                        value={allocations[inv.id] ?? ''}
                        onChange={(e) => setAlloc(inv.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex items-center justify-end gap-6">
        <div className="text-right">
          <span className="text-sm text-muted-foreground">Receipt amount</span>
          <PriceDisplay value={totalAllocated} className="ml-3 font-bold text-lg" />
        </div>
        <Button
          variant="primary"
          loading={saving}
          iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
          onClick={handleSave}
          disabled={!customer}
        >
          Save Receipt
        </Button>
      </div>

      {/* Recent receipts with void */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="font-semibold text-sm">Recent Receipts</h2>
        </div>
        {!recent || recent.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No receipts yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Receipt</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Mode</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{p.payment_no}</td>
                  <td className="px-4 py-2">
                    <DateDisplay value={p.payment_date} />
                  </td>
                  <td className="px-4 py-2 uppercase text-xs">{p.mode}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <PriceDisplay value={p.amount} currency="" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.is_voided ? (
                      <span className="text-xs text-muted-foreground">Voided</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => handleVoid(p.id)}
                      >
                        Void
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
