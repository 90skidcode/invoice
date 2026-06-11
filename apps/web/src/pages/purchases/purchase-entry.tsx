import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal } from 'decimal.js';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

interface BootstrapData {
  org: { id: string; name: string; state_code: string };
  default_branch_id: string;
  default_location_id: string;
}

interface VendorLookup {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  payable: string;
}

interface ItemLookup {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  unit: string;
  tax_rate_id: string;
}

interface PurchaseDetailLine {
  id: string;
  item_id: string;
  item_name_snapshot: string | null;
  unit_id: string;
  tax_rate_id: string;
  qty: string;
  rate: string;
}

interface PurchaseDetail {
  id: string;
  voucher_no: string;
  voucher_date: string;
  vendor_id: string;
  vendor_name_snapshot: string | null;
  vendor_invoice_no: string;
  vendor_invoice_date: string;
  status: string;
  lines: PurchaseDetailLine[];
}

interface PLine {
  key: string;
  item_id: string | null;
  item_name: string;
  unit_id: string | null;
  tax_rate_id: string | null;
  qty: string;
  rate: string;
}

function emptyLine(): PLine {
  return {
    key: uuidv7(),
    item_id: null,
    item_name: '',
    unit_id: null,
    tax_rate_id: null,
    qty: '1',
    rate: '0.00',
  };
}

function lineTotal(l: PLine): string {
  try {
    return new Decimal(l.qty || '0').times(l.rate || '0').toFixed(2);
  } catch {
    return '0.00';
  }
}

function VendorPicker({
  selected,
  onSelect,
  onClear,
}: Readonly<{
  selected: VendorLookup | null;
  onSelect: (v: VendorLookup) => void;
  onClear: () => void;
}>) {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const { data } = useQuery<VendorLookup[]>({
    queryKey: ['vendor-lookup', query],
    queryFn: () => api.get<VendorLookup[]>(`/vendors/lookup?q=${encodeURIComponent(query)}`),
    enabled: open && query.length >= 2,
  });
  const results = data ?? [];

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-3 h-9 text-sm">
        <span className="font-medium">{selected.name}</span>
        {selected.gstin && <span className="text-xs text-muted-foreground">{selected.gstin}</span>}
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
        placeholder="Search vendor…"
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
          {results.map((v) => (
            <button
              key={v.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(v);
                setOpen(false);
              }}
            >
              <span>{v.name}</span>
              {Number(v.payable) > 0 && (
                <span className="text-xs text-muted-foreground">Due ₹{v.payable}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PItemSearch({
  defaultQuery,
  onSelect,
}: Readonly<{ defaultQuery?: string; onSelect: (i: ItemLookup) => void }>) {
  const [query, setQuery] = React.useState(defaultQuery ?? '');
  const [open, setOpen] = React.useState(false);
  const { data } = useQuery<ItemLookup[]>({
    queryKey: ['item-lookup', query],
    queryFn: () => api.get<ItemLookup[]>(`/items/lookup?q=${encodeURIComponent(query)}`),
    enabled: open && query.length >= 2,
  });
  const results = data ?? [];
  return (
    <div className="relative">
      <Input
        placeholder="Item name or SKU…"
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PurchaseEntryPage() {
  const today = new Date().toISOString().slice(0, 10);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id?: string }>();

  const [vendor, setVendor] = React.useState<VendorLookup | null>(null);
  const [vendorInvNo, setVendorInvNo] = React.useState('');
  const [vendorInvDate, setVendorInvDate] = React.useState(today);
  const [voucherDate, setVoucherDate] = React.useState(today);
  const [lines, setLines] = React.useState<PLine[]>([emptyLine()]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: bootstrap } = useQuery<BootstrapData>({
    queryKey: ['pos-bootstrap'],
    queryFn: () => api.get<BootstrapData>('/pos/bootstrap'),
  });

  const { data: editDetail, isLoading: detailLoading } = useQuery<PurchaseDetail>({
    queryKey: ['purchase-detail', editId],
    queryFn: () => api.get<PurchaseDetail>(`/purchase-invoices/${editId}`),
    enabled: !!editId,
  });

  React.useEffect(() => {
    if (!editDetail) return;
    setVendor({
      id: editDetail.vendor_id,
      name: editDetail.vendor_name_snapshot ?? 'Vendor',
      phone: null,
      gstin: null,
      payable: '0',
    });
    setVendorInvNo(editDetail.vendor_invoice_no);
    setVendorInvDate(editDetail.vendor_invoice_date);
    setVoucherDate(editDetail.voucher_date);
    setLines(
      editDetail.lines.map((l) => ({
        key: uuidv7(),
        item_id: l.item_id,
        item_name: l.item_name_snapshot ?? '',
        unit_id: l.unit_id,
        tax_rate_id: l.tax_rate_id,
        qty: l.qty,
        rate: l.rate,
      })),
    );
    setError(null);
  }, [editDetail]);

  const grandTotal = React.useMemo(
    () =>
      lines.reduce((acc, l) => acc.plus(new Decimal(lineTotal(l))), new Decimal('0')).toFixed(2),
    [lines],
  );

  function updateLine(key: string, patch: Partial<PLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    setError(null);
    if (!bootstrap) return;
    if (!vendor) {
      setError('Select a vendor.');
      return;
    }
    if (!vendorInvNo) {
      setError('Enter the vendor invoice number.');
      return;
    }
    const validLines = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (validLines.length === 0) {
      setError('Add at least one item.');
      return;
    }
    setSaving(true);
    try {
      const payloadLines = validLines.map((l) => ({
        client_id: uuidv7(),
        item_id: l.item_id,
        qty: new Decimal(l.qty).toFixed(3),
        free_qty: '0',
        unit_id: l.unit_id,
        rate: new Decimal(l.rate).toFixed(2),
        discount_pct: '0',
        tax_rate_id: l.tax_rate_id,
        update_item_cost: true,
      }));

      let result: { voucher_no: string };
      if (editId) {
        result = await api.patch<{ voucher_no: string }>(`/purchase-invoices/${editId}`, {
          vendor_id: vendor.id,
          vendor_invoice_no: vendorInvNo,
          vendor_invoice_date: vendorInvDate,
          voucher_date: voucherDate,
          place_of_supply: bootstrap.org.state_code,
          reverse_charge: false,
          receive_location_id: bootstrap.default_location_id,
          lines: payloadLines,
        });
        await queryClient.invalidateQueries({ queryKey: ['purchase-detail', editId] });
      } else {
        result = await api.post<{ voucher_no: string }>('/purchase-invoices', {
          client_id: uuidv7(),
          branch_id: bootstrap.default_branch_id,
          vendor_id: vendor.id,
          vendor_invoice_no: vendorInvNo,
          vendor_invoice_date: vendorInvDate,
          voucher_date: voucherDate,
          place_of_supply: bootstrap.org.state_code,
          reverse_charge: false,
          receive_location_id: bootstrap.default_location_id,
          lines: payloadLines,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['purchases-list'] });
      navigate('/purchases', {
        state: {
          saved: `Purchase ${result.voucher_no} ${editId ? 'updated' : 'saved'} and stock updated.`,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase');
      setSaving(false);
    }
  }

  const loadingExisting = !!editId && detailLoading;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Back to purchases"
          onClick={() => navigate('/purchases')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          {editId
            ? `Edit Purchase${editDetail ? ` — ${editDetail.voucher_no}` : ''}`
            : 'New Purchase'}
        </h1>
      </div>

      {loadingExisting ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-4">
            <div className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vendor
              </span>
              <VendorPicker
                selected={vendor}
                onSelect={setVendor}
                onClear={() => setVendor(null)}
              />
            </div>
            <label className="block" htmlFor="purchase-vendor-inv-no">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vendor Invoice No.
              </span>
              <Input
                id="purchase-vendor-inv-no"
                value={vendorInvNo}
                onChange={(e) => setVendorInvNo(e.target.value)}
                placeholder="e.g. VINV-123"
              />
            </label>
            <label className="block" htmlFor="purchase-vendor-inv-date">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Vendor Invoice Date
              </span>
              <Input
                id="purchase-vendor-inv-date"
                type="date"
                value={vendorInvDate}
                onChange={(e) => setVendorInvDate(e.target.value)}
              />
            </label>
            <label className="block" htmlFor="purchase-voucher-date">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Voucher Date
              </span>
              <Input
                id="purchase-voucher-date"
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </label>
          </div>

          <div className="flex-1 rounded-lg border border-border bg-card overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground w-24">
                    Qty
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">
                    Cost Rate
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">
                    Total
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, idx) => (
                  <tr key={line.key} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-1.5">
                      <PItemSearch
                        defaultQuery={line.item_name}
                        onSelect={(item) =>
                          updateLine(line.key, {
                            item_id: item.id,
                            item_name: item.name,
                            unit_id: item.unit,
                            tax_rate_id: item.tax_rate_id,
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
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      <PriceDisplay value={lineTotal(line)} currency="" />
                    </td>
                    <td className="px-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setLines((p) =>
                            p.length === 1 ? p : p.filter((x) => x.key !== line.key),
                          )
                        }
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
                onClick={() => setLines((p) => [...p, emptyLine()])}
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

          <div className="flex items-center justify-end gap-6">
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Total (excl. tax, est.)</span>
              <PriceDisplay value={grandTotal} className="ml-3 font-bold text-lg" />
            </div>
            <Button variant="outline" onClick={() => navigate('/purchases')} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
              onClick={handleSave}
              disabled={!vendor}
            >
              {editId ? 'Update Purchase' : 'Save Purchase'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
