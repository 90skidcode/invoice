import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { ShareWhatsAppDialog } from '@/components/share-whatsapp-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { customerFormSchema } from '@/forms/customer.form';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { openInvoicePrint } from '@/lib/print';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import {
  Check,
  Grid3X3,
  Keyboard,
  Loader2,
  Minus,
  Plus,
  Printer,
  Save,
  Trash2,
  User,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface GridItem {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  category_id: string | null;
  category_name: string | null;
}

interface Category {
  id: string;
  name: string;
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

type PosMode = 'table' | 'grid';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function grandTotal(lines: Line[]): string {
  return lines.reduce((acc, l) => acc.plus(new Decimal(lineTotal(l))), new Decimal('0')).toFixed(2);
}

// ── Customer Search ───────────────────────────────────────────────────────────

const CREDIT_BADGE: Record<CustomerLookupResult['credit_status'], string> = {
  ok: 'text-success',
  near_limit: 'text-warning',
  over_limit: 'text-destructive',
  blocked: 'text-destructive',
};

function CustomerSearch({
  selected,
  onSelect,
  onClear,
  inputRef,
}: Readonly<{
  selected: CustomerLookupResult | null;
  onSelect: (c: CustomerLookupResult) => void;
  onClear: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
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
      referred_by_id: values['referred_by_id'] || null,
    };
    try {
      const result = await api.post<{ id: string; customer_code: string; name: string }>(
        '/customers',
        { client_id: uuidv7(), ...payload },
      );
      onSelect({
        id: result.id,
        name: result.name,
        phone: payload.phone as string,
        credit_status: 'ok',
        balance_due: payload.opening_balance,
      });
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 h-9 text-sm bg-background">
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-medium truncate">{selected.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{selected.phone}</span>
        {Number(selected.balance_due) > 0 && (
          <span className={`text-xs shrink-0 ${CREDIT_BADGE[selected.credit_status]}`}>
            Due ₹{selected.balance_due}
          </span>
        )}
        <button
          type="button"
          className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
          onClick={onClear}
          aria-label="Clear customer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          placeholder="Walk-in — search customer (F3)…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
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
                onMouseDown={(e) => { e.preventDefault(); onSelect(c); setOpen(false); setQuery(''); }}
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
        onClick={() => { setFormError(null); setFormOpen(true); }}
        title="Add New Customer"
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

// ── Table Mode ────────────────────────────────────────────────────────────────

function TableMode({
  lines,
  onLinesChange,
  customer,
  onCustomerSelect,
  onCustomerClear,
  onSave,
  onSavePrint,
  saving,
  error,
  saved,
  onDismissSaved,
  shareOpen,
  onShareOpenChange,
  editLabel,
  onCancelEdit,
  customerInputRef,
}: Readonly<{
  lines: Line[];
  onLinesChange: (lines: Line[]) => void;
  customer: CustomerLookupResult | null;
  onCustomerSelect: (c: CustomerLookupResult) => void;
  onCustomerClear: () => void;
  onSave: (print?: boolean) => void;
  onSavePrint: () => void;
  saving: boolean;
  error: string | null;
  saved: SavedInvoice | null;
  onDismissSaved: () => void;
  shareOpen: boolean;
  onShareOpenChange: (v: boolean) => void;
  editLabel: string;
  onCancelEdit: () => void;
  customerInputRef: React.RefObject<HTMLInputElement>;
}>) {
  const today = new Date().toISOString().slice(0, 10);
  const scanRef = React.useRef<HTMLInputElement>(null);
  const [scanQuery, setScanQuery] = React.useState('');
  const [scanOpen, setScanOpen] = React.useState(false);
  // per-row qty input refs — keyed by line.key
  const qtyRefs = React.useRef<Map<string, HTMLInputElement>>(new Map());

  const { data: scanResults } = useQuery<ItemLookupResult[]>({
    queryKey: ['item-lookup', scanQuery],
    queryFn: () => api.get<ItemLookupResult[]>(`/items/lookup?q=${encodeURIComponent(scanQuery)}`),
    enabled: scanOpen && scanQuery.length >= 2,
  });

  function updateLine(key: string, patch: Partial<Line>) {
    onLinesChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addLine() {
    onLinesChange([...lines, emptyLine()]);
  }

  function removeLine(key: string) {
    onLinesChange(lines.length === 1 ? [emptyLine()] : lines.filter((l) => l.key !== key));
  }

  function selectItem(item: ItemLookupResult) {
    const existingIdx = lines.findIndex((l) => l.item_id === item.id);
    if (existingIdx !== -1) {
      // bump qty on existing line
      const existing = lines[existingIdx];
      if (!existing) return;
      const newQty = new Decimal(existing.qty || '1').plus(1).toFixed(0);
      updateLine(existing.key, { qty: newQty });
      setTimeout(() => qtyRefs.current.get(existing.key)?.select(), 50);
    } else {
      // fill the last empty line or add new
      const emptyIdx = lines.findIndex((l) => !l.item_id);
      const target = emptyIdx !== -1 ? lines[emptyIdx] : null;
      if (target) {
        const patch = {
          item_id: item.id,
          item_name: item.name,
          unit_id: item.unit,
          tax_rate_id: item.tax_rate_id,
          rate: item.sale_price,
          qty: '1',
        };
        updateLine(target.key, patch);
        setTimeout(() => qtyRefs.current.get(target.key)?.select(), 50);
      } else {
        const newLine: Line = {
          key: uuidv7(),
          item_id: item.id,
          item_name: item.name,
          unit_id: item.unit,
          tax_rate_id: item.tax_rate_id,
          rate: item.sale_price,
          qty: '1',
          discount_pct: '0',
        };
        onLinesChange([...lines, newLine]);
        setTimeout(() => qtyRefs.current.get(newLine.key)?.select(), 80);
      }
    }
    setScanQuery('');
    setScanOpen(false);
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  // Global keyboard shortcuts
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // F1 — New bill
      if (e.key === 'F1') {
        e.preventDefault();
        onLinesChange([emptyLine()]);
        setTimeout(() => scanRef.current?.focus(), 50);
      }
      // F2 — focus item scanner
      if (e.key === 'F2') {
        e.preventDefault();
        scanRef.current?.focus();
      }
      // F3 — focus customer
      if (e.key === 'F3') {
        e.preventDefault();
        customerInputRef.current?.focus();
      }
      // F10 — save
      if (e.key === 'F10') {
        e.preventDefault();
        onSave();
      }
      // F12 — save + print
      if (e.key === 'F12') {
        e.preventDefault();
        onSavePrint();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave, onSavePrint, onLinesChange, customerInputRef]);

  // Auto-focus scanner on mount
  React.useEffect(() => { scanRef.current?.focus(); }, []);

  const total = grandTotal(lines.filter((l) => l.item_id));

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Success banner */}
      {saved && (
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-2.5 text-sm border border-success/20">
          <Check className="h-4 w-4 text-success shrink-0" />
          <span>
            Saved <strong>{saved.invoice_no}</strong> — {saved.amount_in_words}
          </span>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <button className="text-xs font-medium text-primary hover:underline" onClick={() => openInvoicePrint(saved.id, 'a4')}>A4</button>
            <button className="text-xs font-medium text-primary hover:underline" onClick={() => openInvoicePrint(saved.id, 'thermal80')}>Thermal</button>
            <button className="text-xs font-medium text-primary hover:underline" onClick={() => onShareOpenChange(true)}>WhatsApp</button>
            <button className="text-xs text-muted-foreground hover:underline" onClick={onDismissSaved}>Dismiss</button>
          </div>
        </div>
      )}
      {saved && (
        <ShareWhatsAppDialog
          open={shareOpen}
          onOpenChange={onShareOpenChange}
          invoiceNo={saved.invoice_no}
          grandTotal={saved.grand_total}
          invoiceHash={saved.invoice_hash || ''}
          defaultPhone={saved.customer_phone}
          customerName={saved.customer_name}
        />
      )}

      {/* Scanner input + Customer + Total bar */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Scan / Search Item <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F2</kbd>
          </p>
          <div className="relative">
            <Input
              ref={scanRef}
              placeholder="Type SKU, name or scan barcode → Enter"
              value={scanQuery}
              onChange={(e) => { setScanQuery(e.target.value); setScanOpen(true); }}
              onFocus={() => setScanOpen(true)}
              onBlur={() => setTimeout(() => setScanOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && scanResults && scanResults.length === 1) {
                  e.preventDefault();
                  const first = scanResults[0];
                  if (first) selectItem(first);
                }
              }}
              className="pr-10"
            />
            {scanOpen && (scanResults ?? []).length > 0 && (
              <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {(scanResults ?? []).map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                      i === 0 && 'bg-accent/50',
                    )}
                    onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
                  >
                    <span className="truncate">
                      <span className="font-mono text-xs text-muted-foreground mr-2">{item.sku}</span>
                      {item.name}
                    </span>
                    <PriceDisplay value={item.sale_price} className="shrink-0 text-xs" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-[220px]">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Customer <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">F3</kbd>
          </p>
          <CustomerSearch
            selected={customer}
            onSelect={onCustomerSelect}
            onClear={onCustomerClear}
            inputRef={customerInputRef}
          />
        </div>

        <div className="text-right">
          <p className="text-xs text-muted-foreground">Grand Total</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">₹{total}</p>
          <p className="text-[10px] text-muted-foreground">Server computes final tax</p>
        </div>
      </div>

      {/* Lines table */}
      <div className="flex-1 rounded-lg border border-border bg-card overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80 backdrop-blur-sm">
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
              <tr
                key={line.key}
                className={cn(
                  'border-b border-border last:border-0 transition-colors',
                  line.item_id ? 'hover:bg-muted/20' : 'bg-muted/5',
                )}
              >
                <td className="px-3 py-1.5 text-muted-foreground text-xs">{idx + 1}</td>
                <td className="px-3 py-1.5 font-medium">
                  {line.item_name || <span className="text-muted-foreground text-xs italic">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    selectOnFocus
                    value={line.qty}
                    ref={(el) => {
                      if (el) qtyRefs.current.set(line.key, el);
                      else qtyRefs.current.delete(line.key);
                    }}
                    onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // move to next row or add new line
                        const next = lines[idx + 1];
                        if (next) {
                          qtyRefs.current.get(next.key)?.select();
                        } else {
                          addLine();
                          setTimeout(() => scanRef.current?.focus(), 50);
                        }
                      }
                    }}
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
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t border-border/50">
          <Button type="button" variant="ghost" size="sm" onClick={addLine} iconLeft={<Plus className="h-3.5 w-3.5" />}>
            Add Line
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {/* Footer: actions + shortcut bar */}
      <div className="flex items-center justify-between gap-4">
        {/* Shortcut hints */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {[
            ['F1', 'New Bill'],
            ['F2', 'Item'],
            ['F3', 'Customer'],
            ['F10', 'Save'],
            ['F12', 'Save+Print'],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{key}</kbd>
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {editLabel && (
            <Button type="button" variant="outline" size="sm" onClick={onCancelEdit}>
              Cancel Edit
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            iconLeft={<Printer className="h-4 w-4" />}
            onClick={() => onSave(true)}
          >
            Save + Print
            <kbd className="ml-1.5 rounded bg-muted/50 px-1 text-[10px]">F12</kbd>
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={saving}
            iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
            onClick={() => onSave()}
          >
            {editLabel || 'Save Invoice'}
            <kbd className="ml-1.5 rounded bg-white/20 px-1 text-[10px]">F10</kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Grid Mode ─────────────────────────────────────────────────────────────────

function GridMode({
  lines,
  onLinesChange,
  customer,
  onCustomerSelect,
  onCustomerClear,
  onSave,
  saving,
  error,
  saved,
  onDismissSaved,
  shareOpen,
  onShareOpenChange,
  editLabel,
  onCancelEdit,
  customerInputRef,
}: Readonly<{
  lines: Line[];
  onLinesChange: (lines: Line[]) => void;
  customer: CustomerLookupResult | null;
  onCustomerSelect: (c: CustomerLookupResult) => void;
  onCustomerClear: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  saved: SavedInvoice | null;
  onDismissSaved: () => void;
  shareOpen: boolean;
  onShareOpenChange: (v: boolean) => void;
  editLabel: string;
  onCancelEdit: () => void;
  customerInputRef: React.RefObject<HTMLInputElement>;
}>) {
  const [activeCat, setActiveCat] = React.useState<string>('all');
  const [gridSearch, setGridSearch] = React.useState('');

  const { data: gridItems } = useQuery<GridItem[]>({
    queryKey: ['items', gridSearch],
    queryFn: () =>
      api.get<GridItem[]>(
        gridSearch.length >= 2 ? `/items?q=${encodeURIComponent(gridSearch)}` : '/items',
      ),
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  const visibleItems = (gridItems ?? []).filter((item) => {
    if (activeCat !== 'all' && item.category_id !== activeCat) return false;
    return true;
  });

  function addToCart(item: GridItem) {
    const existing = lines.find((l) => l.item_id === item.id);
    if (existing) {
      const newQty = new Decimal(existing.qty || '1').plus(1).toFixed(0);
      onLinesChange(lines.map((l) => (l.key === existing.key ? { ...l, qty: newQty } : l)));
    } else {
      const emptyIdx = lines.findIndex((l) => !l.item_id);
      const newLine: Line = {
        key: uuidv7(),
        item_id: item.id,
        item_name: item.name,
        unit_id: null,
        tax_rate_id: null,
        rate: item.sale_price,
        qty: '1',
        discount_pct: '0',
      };
      if (emptyIdx !== -1) {
        const updated = [...lines];
        updated[emptyIdx] = newLine;
        onLinesChange(updated);
      } else {
        onLinesChange([...lines, newLine]);
      }
    }
  }

  function changeQty(key: string, delta: number) {
    onLinesChange(
      lines
        .map((l) => {
          if (l.key !== key) return l;
          const newQty = Math.max(0, Number(l.qty || 0) + delta);
          return { ...l, qty: String(newQty) };
        })
        .filter((l) => !l.item_id || Number(l.qty) > 0),
    );
  }

  function removeLine(key: string) {
    const filtered = lines.filter((l) => l.key !== key);
    onLinesChange(filtered.length === 0 ? [emptyLine()] : filtered);
  }

  const cartLines = lines.filter((l) => l.item_id && Number(l.qty) > 0);
  const total = grandTotal(cartLines);

  // Category color palette
  const catColors = [
    'bg-blue-100 text-blue-800 border-blue-200',
    'bg-purple-100 text-purple-800 border-purple-200',
    'bg-green-100 text-green-800 border-green-200',
    'bg-orange-100 text-orange-800 border-orange-200',
    'bg-pink-100 text-pink-800 border-pink-200',
    'bg-teal-100 text-teal-800 border-teal-200',
  ];
  const catColorMap = new Map(
    (categories ?? []).map((c, i) => [c.id, catColors[i % catColors.length] ?? catColors[0]!]),
  );

  return (
    <div className="flex h-full gap-4 min-h-0">
      {/* Left: catalog */}
      <div className="flex flex-col flex-1 min-w-0 gap-3">
        {/* Category tabs */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveCat('all')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              activeCat === 'all'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-muted text-muted-foreground border-border hover:border-foreground/30',
            )}
          >
            All Items
          </button>
          {(categories ?? []).map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCat(cat.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                activeCat === cat.id
                  ? 'bg-foreground text-background border-foreground'
                  : cn('border', catColorMap.get(cat.id), 'hover:opacity-80'),
              )}
            >
              {cat.name}
            </button>
          ))}
          <div className="ml-auto">
            <Input
              placeholder="Search…"
              className="h-8 w-40 text-sm"
              value={gridSearch}
              onChange={(e) => setGridSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto">
          {visibleItems.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No items found
            </div>
          ) : (
            <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 pb-3">
              {visibleItems.map((item) => {
                const inCart = cartLines.find((l) => l.item_id === item.id);
                const catColor = item.category_id ? catColorMap.get(item.category_id) : undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToCart(item)}
                    className={cn(
                      'relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all',
                      'hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
                      inCart
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border bg-card hover:border-border/80',
                    )}
                  >
                    {inCart && (
                      <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {inCart.qty}
                      </span>
                    )}
                    {item.category_name && catColor && (
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', catColor)}>
                        {item.category_name}
                      </span>
                    )}
                    <span className="text-sm font-semibold leading-tight line-clamp-2">
                      {item.name}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">{item.sku}</span>
                    <span className="text-base font-bold text-primary mt-auto">
                      ₹{item.sale_price}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Order panel */}
      <div className="w-80 shrink-0 flex flex-col gap-3 border-l border-border pl-4">
        {/* Customer */}
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
          <CustomerSearch
            selected={customer}
            onSelect={onCustomerSelect}
            onClear={onCustomerClear}
            inputRef={customerInputRef}
          />
        </div>

        {/* Success */}
        {saved && (
          <div className="rounded-md bg-success/10 border border-success/20 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-success mb-1">
              <Check className="h-3.5 w-3.5" />
              {saved.invoice_no} saved
            </div>
            <div className="flex gap-3">
              <button className="text-primary hover:underline" onClick={() => openInvoicePrint(saved.id, 'a4')}>A4</button>
              <button className="text-primary hover:underline" onClick={() => openInvoicePrint(saved.id, 'thermal80')}>Thermal</button>
              <button className="text-primary hover:underline" onClick={() => onShareOpenChange(true)}>WhatsApp</button>
              <button className="ml-auto text-muted-foreground hover:underline" onClick={onDismissSaved}>✕</button>
            </div>
          </div>
        )}
        {saved && (
          <ShareWhatsAppDialog
            open={shareOpen}
            onOpenChange={onShareOpenChange}
            invoiceNo={saved.invoice_no}
            grandTotal={saved.grand_total}
            invoiceHash={saved.invoice_hash || ''}
            defaultPhone={saved.customer_phone}
            customerName={saved.customer_name}
          />
        )}

        {/* Cart lines */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {cartLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-1">
              <Grid3X3 className="h-8 w-8 opacity-20" />
              <p>Tap items to add them</p>
            </div>
          ) : (
            cartLines.map((line) => (
              <div
                key={line.key}
                className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{line.item_name}</p>
                  <p className="text-xs text-muted-foreground">
                    ₹{line.rate} × {line.qty} = ₹{lineTotal(line)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => changeQty(line.key, -1)}
                    className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-muted"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold tabular-nums">{line.qty}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(line.key, 1)}
                    className="h-6 w-6 rounded-md border border-border flex items-center justify-center hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive ml-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-border pt-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{cartLines.length} item{cartLines.length !== 1 ? 's' : ''}</span>
            <span className="font-medium">₹{total}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Server computes GST &amp; round-off on save</p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {editLabel && (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={onCancelEdit}>
              Cancel Edit
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            className="w-full"
            loading={saving}
            iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
            onClick={onSave}
            disabled={cartLines.length === 0}
          >
            {editLabel || 'Save Invoice'} — ₹{total}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            iconLeft={<Printer className="h-4 w-4" />}
            onClick={() => openInvoicePrint(saved?.id ?? '', 'a4')}
            disabled={!saved}
          >
            Print Last Invoice
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main POS Page ─────────────────────────────────────────────────────────────

export function PosPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');

  const [posMode, setPosMode] = React.useState<PosMode>(() => {
    return (localStorage.getItem('pos_mode') as PosMode | null) ?? 'table';
  });

  const [lines, setLines] = React.useState<Line[]>([emptyLine()]);
  const [customer, setCustomer] = React.useState<CustomerLookupResult | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<SavedInvoice | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  const customerInputRef = React.useRef<HTMLInputElement>(null);

  function switchMode(m: PosMode) {
    setPosMode(m);
    localStorage.setItem('pos_mode', m);
  }

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
    if (!editInvoice) return;
    const load = async () => {
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
      const mapped: Line[] = (editInvoice.lines ?? []).map((l: any) => ({
        key: uuidv7(),
        item_id: l.item_id,
        item_name: l.item_name_snapshot ?? '',
        unit_id: l.unit_id,
        tax_rate_id: l.tax_rate_id,
        qty: String(l.qty),
        rate: String(l.rate),
        discount_pct: String(l.discount_pct || '0'),
      }));
      setLines(mapped.length > 0 ? mapped : [emptyLine()]);
    };
    load();
  }, [editInvoice]);

  async function handleSave(print = false) {
    setError(null);
    if (!bootstrap) { setError('Still loading configuration…'); return; }
    const validLines = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (validLines.length === 0) { setError('Add at least one item.'); return; }

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
        result = await api.patch<SavedInvoice>(`/invoices/${editId}`, {
          invoice_date: payload.invoice_date,
          customer_id: payload.customer_id,
          place_of_supply: payload.place_of_supply,
          lines: payload.lines,
        });
      } else {
        result = await api.post<SavedInvoice>('/invoices', payload);
      }

      const saved: SavedInvoice = {
        ...result,
        customer_phone: customer?.phone || '',
        customer_name: customer?.name || '',
      };
      setSaved(saved);
      setLines([emptyLine()]);
      setCustomer(null);
      if (editId) setSearchParams({});

      if (print) openInvoicePrint(result.id, 'a4');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  }

  if (editId && editInvoiceLoading) {
    return (
      <div className="flex h-full items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-primary" /> Loading invoice…
      </div>
    );
  }

  const editLabel = editId ? `Update ${editInvoice?.invoice_no ?? ''}` : '';

  const sharedProps = {
    lines,
    onLinesChange: setLines,
    customer,
    onCustomerSelect: setCustomer,
    onCustomerClear: () => setCustomer(null),
    saving,
    error,
    saved,
    onDismissSaved: () => setSaved(null),
    shareOpen,
    onShareOpenChange: setShareOpen,
    editLabel,
    onCancelEdit: () => { setSearchParams({}); setLines([emptyLine()]); setCustomer(null); },
    customerInputRef,
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold leading-none">
            {editId ? `Edit Invoice ${editInvoice?.invoice_no ?? ''}` : 'New Invoice'}
          </h1>
          {bootstrapLoading && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading config…
            </span>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/30">
          <button
            type="button"
            onClick={() => switchMode('table')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              posMode === 'table'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Keyboard className="h-3.5 w-3.5" />
            Fast Entry
          </button>
          <button
            type="button"
            onClick={() => switchMode('grid')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              posMode === 'grid'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Grid3X3 className="h-3.5 w-3.5" />
            Visual Grid
          </button>
        </div>
      </div>

      {/* Mode content */}
      <div className="flex-1 min-h-0">
        {posMode === 'table' ? (
          <TableMode {...sharedProps} onSave={handleSave} onSavePrint={() => handleSave(true)} />
        ) : (
          <GridMode {...sharedProps} onSave={() => handleSave()} />
        )}
      </div>
    </div>
  );
}
