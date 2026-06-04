import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { ShareWhatsAppDialog } from '@/components/share-whatsapp-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { customerFormSchema } from '@/forms/customer.form';
import { api } from '@/lib/api-client';
import { openInvoicePrint } from '@/lib/print';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { Check, Loader2, Plus, Printer, Save, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

interface BootstrapData {
  org: { id: string; name: string; state_code: string };
  default_series_id: string;
  default_branch_id: string;
  default_location_id: string;
  payment_modes: { id: string; name: string; type: string }[];
}

interface ItemLookupResult {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  unit: string;
  tax_rate_id: string;
  hsn_code: string | null;
}

interface CustomerLookupResult {
  id: string;
  name: string;
  phone: string;
  credit_status: 'ok' | 'near_limit' | 'over_limit' | 'blocked';
  balance_due: string;
}

interface Line {
  key: string;
  item_id: string | null;
  item_name: string;
  unit_id: string | null;
  tax_rate_id: string | null;
  qty: string;
  rate: string;
  discount_pct: string;
}

interface SavedInvoice {
  id: string;
  invoice_no: string;
  grand_total: string;
  amount_in_words: string;
  invoice_hash?: string;
  customer_phone?: string;
  customer_name?: string;
}

function emptyLine(): Line {
  return {
    key: uuidv7(),
    item_id: null,
    item_name: '',
    unit_id: null,
    tax_rate_id: null,
    qty: '1',
    rate: '0.00',
    discount_pct: '0',
  };
}

function lineTotal(l: Line): string {
  try {
    const gross = new Decimal(l.qty || '0').times(l.rate || '0');
    const disc = gross.times(l.discount_pct || '0').dividedBy(100);
    return gross.minus(disc).toFixed(2);
  } catch {
    return '0.00';
  }
}

/** Inline typeahead that resolves an item and fills the line. */
function ItemSearch({
  value,
  onSelect,
}: Readonly<{
  value: string;
  onSelect: (item: ItemLookupResult) => void;
}>) {
  const [query, setQuery] = React.useState(value);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setQuery(value), [value]);

  const { data } = useQuery<ItemLookupResult[]>({
    queryKey: ['item-lookup', query],
    queryFn: () => api.get<ItemLookupResult[]>(`/items/lookup?q=${encodeURIComponent(query)}`),
    enabled: open && query.length >= 2,
  });

  const results = data ?? [];

  return (
    <div className="relative">
      <Input
        placeholder="Type item name or SKU…"
        className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-72 overflow-auto rounded-md border border-border bg-popover shadow-md">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>{' '}
                {item.name}
              </span>
              <PriceDisplay value={item.sale_price} className="shrink-0 text-xs" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const CREDIT_BADGE: Record<CustomerLookupResult['credit_status'], string> = {
  ok: 'text-success',
  near_limit: 'text-warning',
  over_limit: 'text-destructive',
  blocked: 'text-destructive',
};

/** Customer typeahead for credit billing (walk-in if left blank). */
function CustomerSearch({
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
  const [formOpen, setFormOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data } = useQuery<CustomerLookupResult[]>({
    queryKey: ['customer-lookup', query],
    queryFn: () =>
      api.get<CustomerLookupResult[]>(`/customers/lookup?q=${encodeURIComponent(query)}`),
    enabled: open && query.length >= 2,
  });
  const results = data ?? [];

  async function handleSubmit(values: FormValues) {
    setFormError(null);
    setSaving(true);
    const payload = {
      name: values['name'],
      type: values['type'] || 'Individual',
      phone: values['phone'],
      email: values['email'] || null,
      gstin: values['gstin'] || null,
      gst_reg_type: values['gst_reg_type'] || 'Consumer',
      credit_limit: String(values['credit_limit'] ?? '0.00'),
      credit_days: Number(values['credit_days'] ?? 0),
      block_on_limit_breach: !!values['block_on_limit_breach'],
      opening_balance: String(values['opening_balance'] ?? '0.00'),
      status: values['status'] || 'Active',
    };
    try {
      const result = await api.post<{ id: string; customer_code: string; name: string }>(
        '/customers',
        {
          client_id: uuidv7(),
          ...payload,
        },
      );
      const newCustomer: CustomerLookupResult = {
        id: result.id,
        name: result.name,
        phone: payload.phone as string,
        credit_status: 'ok',
        balance_due: payload.opening_balance,
      };
      onSelect(newCustomer);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 h-9 text-sm">
        <span className="font-medium">{selected.name}</span>
        <span className="text-xs text-muted-foreground">{selected.phone}</span>
        {Number(selected.balance_due) > 0 && (
          <span className={`text-xs ${CREDIT_BADGE[selected.credit_status]}`}>
            Due ₹{selected.balance_due}
          </span>
        )}
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
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          placeholder="Walk-in — search customer…"
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
                <span className="truncate">
                  {c.name} <span className="text-xs text-muted-foreground">{c.phone}</span>
                </span>
                {c.credit_status === 'blocked' && (
                  <span className="shrink-0 text-xs text-destructive">Blocked</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => {
          setFormError(null);
          setFormOpen(true);
        }}
        title="Add Customer"
        className="shrink-0"
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" title="New Customer">
          <FormRenderer
            schema={customerFormSchema}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={saving}
            error={formError}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PosPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [customer, setCustomer] = React.useState<CustomerLookupResult | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<SavedInvoice | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  const { data: bootstrap, isLoading: bootstrapLoading } = useQuery<BootstrapData>({
    queryKey: ['pos-bootstrap'],
    queryFn: () => api.get<BootstrapData>('/pos/bootstrap'),
  });

  const { data: editInvoice, isLoading: editInvoiceLoading } = useQuery<any>({
    queryKey: ['invoice-edit', editId],
    queryFn: () => api.get<any>(`/invoices/${editId}`),
    enabled: !!editId,
  });

  React.useEffect(() => {
    if (editInvoice) {
      const loadCustomer = async () => {
        if (editInvoice.customer_id) {
          try {
            const cust = await api.get<any>(`/customers/${editInvoice.customer_id}`);
            setCustomer({
              id: editInvoice.customer_id,
              name: editInvoice.customer_name_snapshot || cust.name,
              phone: cust.phone || '',
              credit_status: 'ok',
              balance_due: cust.opening_balance || '0.00',
            });
          } catch {
            setCustomer({
              id: editInvoice.customer_id,
              name: editInvoice.customer_name_snapshot ?? 'Customer',
              phone: '',
              credit_status: 'ok',
              balance_due: '0.00',
            });
          }
        } else {
          setCustomer(null);
        }
      };

      loadCustomer();

      const mappedLines = editInvoice.lines.map((l: any) => ({
        key: uuidv7(),
        item_id: l.item_id,
        item_name: l.item_name_snapshot ?? '',
        unit_id: l.unit_id,
        tax_rate_id: l.tax_rate_id,
        qty: String(l.qty),
        rate: String(l.rate),
        discount_pct: String(l.discount_pct || '0'),
      }));

      setLines(mappedLines.length > 0 ? mappedLines : [emptyLine()]);
    }
  }, [editInvoice]);

  const grandTotalDisplay = React.useMemo(
    () =>
      lines.reduce((acc, l) => acc.plus(new Decimal(lineTotal(l))), new Decimal('0')).toFixed(2),
    [lines],
  );

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  async function handleSave() {
    setError(null);
    if (!bootstrap) {
      setError('Still loading configuration…');
      return;
    }
    const validLines = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (validLines.length === 0) {
      setError('Add at least one item.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: uuidv7(),
        series_id: bootstrap.default_series_id,
        branch_id: bootstrap.default_branch_id,
        invoice_date: editInvoice?.invoice_date || today,
        customer_id: customer?.id ?? null,
        place_of_supply: bootstrap.org.state_code,
        lines: validLines.map((l) => ({
          client_id: uuidv7(),
          item_id: l.item_id,
          qty: new Decimal(l.qty).toFixed(3),
          unit_id: l.unit_id,
          rate: new Decimal(l.rate).toFixed(2),
          discount_pct: l.discount_pct || '0',
          tax_rate_id: l.tax_rate_id,
          location_id: bootstrap.default_location_id,
          is_free: false,
        })),
        auto_print: false,
      };

      let result: SavedInvoice;
      if (editId) {
        const updatePayload = {
          invoice_date: payload.invoice_date,
          customer_id: payload.customer_id,
          place_of_supply: payload.place_of_supply,
          lines: payload.lines,
        };
        result = await api.patch<SavedInvoice>(`/invoices/${editId}`, updatePayload);
      } else {
        result = await api.post<SavedInvoice>('/invoices', payload);
      }

      setSaved({
        ...result,
        customer_phone: customer?.phone || '',
        customer_name: customer?.name || '',
      });
      setLines([emptyLine()]);
      setCustomer(null);
      if (editId) {
        setSearchParams({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  }

  if (editId && editInvoiceLoading) {
    return (
      <div className="flex h-full items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-primary" /> Loading invoice details…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {editId ? `Edit Invoice ${editInvoice?.invoice_no ?? ''}` : 'New Invoice'}
        </h1>
        {(bootstrapLoading || editInvoiceLoading) && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </span>
        )}
      </div>

      {saved && (
        <>
          <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-3 text-sm">
            <Check className="h-4 w-4 text-success" />
            <span>
              Saved <strong>{saved.invoice_no}</strong> — {saved.amount_in_words}
            </span>
            <div className="ml-auto flex items-center gap-3">
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => openInvoicePrint(saved.id, 'a4')}
              >
                Print A4
              </button>
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => openInvoicePrint(saved.id, 'thermal80')}
              >
                Thermal
              </button>
              <button
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setShareOpen(true)}
              >
                Share WhatsApp
              </button>
              <button
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setSaved(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
          <ShareWhatsAppDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            invoiceNo={saved.invoice_no}
            grandTotal={saved.grand_total}
            invoiceHash={saved.invoice_hash || ''}
            defaultPhone={saved.customer_phone}
            customerName={saved.customer_name}
          />
        </>
      )}

      {/* Header — customer */}
      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-card p-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer
          </span>
          <CustomerSearch
            selected={customer}
            onSelect={setCustomer}
            onClear={() => setCustomer(null)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Invoice Date
          </span>
          <Input type="date" value={today} readOnly className="bg-muted/30" />
        </label>
      </div>

      {/* Lines */}
      <div className="flex-1 rounded-lg border border-border bg-card overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">Qty</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Rate</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Disc%</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={line.key} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-1.5">
                  <ItemSearch
                    value={line.item_name}
                    onSelect={(item) =>
                      updateLine(line.key, {
                        item_id: item.id,
                        item_name: item.name,
                        unit_id: item.unit,
                        tax_rate_id: item.tax_rate_id,
                        rate: item.sale_price,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    selectOnFocus
                    value={line.qty}
                    onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    selectOnFocus
                    prefix="₹"
                    value={line.rate}
                    onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    selectOnFocus
                    suffix="%"
                    value={line.discount_pct}
                    onChange={(e) => updateLine(line.key, { discount_pct: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  <PriceDisplay value={lineTotal(line)} currency="" />
                </td>
                <td className="px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeLine(line.key)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addLine}
            iconLeft={<Plus className="h-4 w-4" />}
          >
            Add Line
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Footer: totals + actions */}
      <div className="flex items-end justify-end gap-6">
        <div className="space-y-1 text-right min-w-[200px]">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total (incl. tax, est.)</span>
            <PriceDisplay value={grandTotalDisplay} className="font-bold text-lg" />
          </div>
          <p className="text-xs text-muted-foreground">Server computes final tax &amp; round-off</p>
        </div>

        <div className="flex gap-2">
          {editId && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchParams({});
                setLines([emptyLine()]);
                setCustomer(null);
              }}
            >
              Cancel Edit
            </Button>
          )}
          <Button type="button" variant="outline" iconLeft={<Printer className="h-4 w-4" />}>
            Print
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
            onClick={handleSave}
          >
            {editId ? 'Update Invoice' : 'Save Invoice'}
          </Button>
        </div>
      </div>
    </div>
  );
}
