import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Save, Trash2 } from 'lucide-react';
import * as React from 'react';
import { uuidv7 } from 'uuidv7';

type Tab = 'adjust' | 'transfer' | 'ledger';
const TABS: { id: Tab; label: string }[] = [
  { id: 'adjust', label: 'Adjustment' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'ledger', label: 'Stock Ledger' },
];

interface LocationOpt {
  id: string;
  name: string;
  is_default: boolean;
}
interface ItemLookup {
  id: string;
  sku: string;
  name: string;
}

function useLocations() {
  return useQuery<LocationOpt[]>({
    queryKey: ['locations'],
    queryFn: () => api.get<LocationOpt[]>('/locations'),
  });
}

/** Inline item typeahead returning the chosen item. */
function ItemSearch({
  onSelect,
  value,
}: Readonly<{ onSelect: (i: ItemLookup) => void; value: string }>) {
  const [query, setQuery] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setQuery(value), [value]);
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
        className="h-8"
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
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
                setQuery(item.name);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>{' '}
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const REASONS = ['damaged', 'expired', 'count_variance', 'found', 'theft', 'quality', 'other'];

function AdjustmentTab() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: locations } = useLocations();
  const [locationId, setLocationId] = React.useState('');
  const [reason, setReason] = React.useState('damaged');
  const [lines, setLines] = React.useState([
    { key: uuidv7(), item_id: '', item_name: '', qty_change: '-1' },
  ]);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!locationId && locations?.length)
      setLocationId(locations.find((l) => l.is_default)?.id ?? locations[0]!.id);
  }, [locations, locationId]);

  async function save() {
    setError(null);
    const valid = lines.filter((l) => l.item_id && Number(l.qty_change) !== 0);
    if (!locationId || valid.length === 0) {
      setError('Pick a location and at least one item.');
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<{ adjustment_no: string }>('/stock-adjustments', {
        client_id: uuidv7(),
        adjustment_date: today,
        location_id: locationId,
        reason,
        lines: valid.map((l) => ({ item_id: l.item_id, qty_change: l.qty_change })),
      });
      setSaved(r.adjustment_no);
      setLines([{ key: uuidv7(), item_id: '', item_name: '', qty_change: '-1' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {saved && (
        <div className="rounded-md bg-success/10 px-4 py-2 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 text-success" /> Adjustment {saved} posted
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Location</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Reason</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">
                Qty Change (±)
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">
                  <ItemSearch
                    value={l.item_name}
                    onSelect={(it) =>
                      setLines((p) =>
                        p.map((x) =>
                          x.key === l.key ? { ...x, item_id: it.id, item_name: it.name } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    value={l.qty_change}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x) => (x.key === l.key ? { ...x, qty_change: e.target.value } : x)),
                      )
                    }
                  />
                </td>
                <td className="px-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Remove"
                    onClick={() =>
                      setLines((p) => (p.length === 1 ? p : p.filter((x) => x.key !== l.key)))
                    }
                    disabled={lines.length === 1}
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
            variant="ghost"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={() =>
              setLines((p) => [
                ...p,
                { key: uuidv7(), item_id: '', item_name: '', qty_change: '-1' },
              ])
            }
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
      <div className="flex justify-end">
        <Button
          variant="primary"
          loading={saving}
          iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
          onClick={save}
        >
          Post Adjustment
        </Button>
      </div>
    </div>
  );
}

function TransferTab() {
  const today = new Date().toISOString().slice(0, 10);
  const { data: locations } = useLocations();
  const [fromId, setFromId] = React.useState('');
  const [toId, setToId] = React.useState('');
  const [lines, setLines] = React.useState([
    { key: uuidv7(), item_id: '', item_name: '', qty: '1' },
  ]);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (locations?.length) {
      if (!fromId) setFromId(locations.find((l) => l.is_default)?.id ?? locations[0]!.id);
      if (!toId && locations.length > 1)
        setToId(locations.find((l) => !l.is_default)?.id ?? locations[1]!.id);
    }
  }, [locations, fromId, toId]);

  async function save() {
    setError(null);
    const valid = lines.filter((l) => l.item_id && Number(l.qty) > 0);
    if (!fromId || !toId || fromId === toId || valid.length === 0) {
      setError('Pick distinct locations and items.');
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<{ transfer_no: string }>('/stock-transfers', {
        client_id: uuidv7(),
        transfer_date: today,
        from_location_id: fromId,
        to_location_id: toId,
        mode: 'direct',
        lines: valid.map((l) => ({ item_id: l.item_id, qty: l.qty })),
      });
      setSaved(r.transfer_no);
      setLines([{ key: uuidv7(), item_id: '', item_name: '', qty: '1' }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {saved && (
        <div className="rounded-md bg-success/10 px-4 py-2 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 text-success" /> Transfer {saved} done
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 max-w-lg">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">From</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">To</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
          >
            <option value="">Select…</option>
            {(locations ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-32">Qty</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">
                  <ItemSearch
                    value={l.item_name}
                    onSelect={(it) =>
                      setLines((p) =>
                        p.map((x) =>
                          x.key === l.key ? { ...x, item_id: it.id, item_name: it.name } : x,
                        ),
                      )
                    }
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    value={l.qty}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x) => (x.key === l.key ? { ...x, qty: e.target.value } : x)),
                      )
                    }
                  />
                </td>
                <td className="px-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Remove"
                    onClick={() =>
                      setLines((p) => (p.length === 1 ? p : p.filter((x) => x.key !== l.key)))
                    }
                    disabled={lines.length === 1}
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
            variant="ghost"
            size="sm"
            iconLeft={<Plus className="h-4 w-4" />}
            onClick={() =>
              setLines((p) => [...p, { key: uuidv7(), item_id: '', item_name: '', qty: '1' }])
            }
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
      <div className="flex justify-end">
        <Button
          variant="primary"
          loading={saving}
          iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
          onClick={save}
        >
          Transfer Stock
        </Button>
      </div>
    </div>
  );
}

interface LedgerEntry {
  id: string;
  txn_type: string;
  txn_date: string;
  qty_in: string;
  qty_out: string;
  balance_qty: string;
  note: string | null;
}

interface ItemWithStock {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  current_stock: string;
}

function LedgerTab() {
  const [selectedItem, setSelectedItem] = React.useState<ItemWithStock | null>(null);

  const { data: itemsResp, isLoading: itemsLoading } = useQuery<{ data: ItemWithStock[] }>({
    queryKey: ['stock-ledger-items'],
    queryFn: () => api.get('/stock-ledger/items'),
  });

  const { data: ledgerResp } = useQuery<{
    entries: LedgerEntry[];
    summary: { total_in: string; total_out: string; closing: string };
  }>({
    queryKey: ['stock-ledger', selectedItem?.id],
    queryFn: () => api.get(`/stock-ledger?item_id=${selectedItem!.id}`),
    enabled: !!selectedItem,
  });

  const itemsList = itemsResp?.data ?? [];

  function handleItemClick(item: ItemWithStock) {
    setSelectedItem(selectedItem?.id === item.id ? null : item);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">SKU</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                Sale Price
              </th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                Current Stock
              </th>
            </tr>
          </thead>
          <tbody>
            {itemsLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!itemsLoading && itemsList.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No items found.
                </td>
              </tr>
            )}
            {itemsList.map((item) => (
              <tr
                key={item.id}
                className={cn(
                  'border-b border-border last:border-0',
                  selectedItem?.id === item.id && 'bg-primary/5',
                )}
              >
                <td className="px-4 py-2 text-xs text-muted-foreground">{item.sku}</td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="font-medium text-primary hover:underline text-left"
                  >
                    {item.name}
                  </button>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <PriceDisplay value={item.sale_price} />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{item.current_stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedItem && ledgerResp && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{selectedItem.name} — Ledger</h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>
                In: <span className="font-medium text-foreground">{ledgerResp.summary.total_in}</span>
              </span>
              <span>
                Out: <span className="font-medium text-foreground">{ledgerResp.summary.total_out}</span>
              </span>
              <span>
                Closing: <span className="font-medium text-foreground">{ledgerResp.summary.closing}</span>
              </span>
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">In</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Out</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Balance
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledgerResp.entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-xs text-muted-foreground"
                    >
                      No ledger entries for this item.
                    </td>
                  </tr>
                )}
                {ledgerResp.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-xs">{e.txn_date.slice(0, 10)}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs uppercase">{e.txn_type.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-success">
                      {Number(e.qty_in) > 0 ? e.qty_in : ''}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-destructive">
                      {Number(e.qty_out) > 0 ? e.qty_out : ''}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">
                      {e.balance_qty}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{e.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function StockPage() {
  const [tab, setTab] = React.useState<Tab>('adjust');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Stock</h1>
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'adjust' && <AdjustmentTab />}
      {tab === 'transfer' && <TransferTab />}
      {tab === 'ledger' && <LedgerTab />}
    </div>
  );
}
