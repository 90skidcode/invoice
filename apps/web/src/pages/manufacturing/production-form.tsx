import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Check, Factory } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

interface ItemLookup {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  unit: string;
  tax_rate_id: string;
}

interface PreviewRequirement {
  raw_item_id: string;
  name: string;
  required: string;
  available: string;
  sufficient: boolean;
  cost: string;
}

interface PreviewData {
  finished_item_id: string;
  finished_item_name: string;
  output_qty: string;
  requirements: PreviewRequirement[];
  material_cost: string;
  labor_cost: string;
  overhead_cost: string;
  total_cost: string;
  cost_per_unit: string;
  all_sufficient: boolean;
}

function ItemSearch({ onSelect }: Readonly<{ onSelect: (i: ItemLookup) => void }>) {
  const [query, setQuery] = React.useState('');
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
        placeholder="Search finished good…"
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

export function ProductionFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [finishedItem, setFinishedItem] = React.useState<{ id: string; name: string } | null>(null);
  const [qty, setQty] = React.useState('1');
  const [productionDate, setProductionDate] = React.useState(today);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const previewEnabled = !!finishedItem && Number(qty) > 0;
  const {
    data: preview,
    isLoading: previewLoading,
    error: previewError,
  } = useQuery<PreviewData>({
    queryKey: ['production-preview', finishedItem?.id, qty],
    queryFn: () =>
      api.get<PreviewData>(
        `/production-orders/preview?finished_item_id=${finishedItem?.id}&qty=${encodeURIComponent(qty)}`,
      ),
    enabled: previewEnabled,
    retry: false,
  });

  async function handleComplete() {
    setError(null);
    if (!finishedItem) {
      setError('Select a finished good to produce.');
      return;
    }
    if (Number(qty) <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ voucher_no: string }>('/production-orders', {
        finished_item_id: finishedItem.id,
        produced_qty: qty,
        production_date: productionDate,
      });
      await queryClient.invalidateQueries({ queryKey: ['production-list'] });
      navigate('/manufacturing/production', {
        state: { saved: `Production ${result.voucher_no} completed — stock updated.` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete production');
      setSaving(false);
    }
  }

  const previewErrMsg =
    previewError instanceof Error ? previewError.message : 'No active recipe for this item';

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Back to production"
          onClick={() => navigate('/manufacturing/production')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">New Production</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-3">
        <div className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Finished Good
          </span>
          <ItemSearch onSelect={(item) => setFinishedItem({ id: item.id, name: item.name })} />
        </div>
        <label className="block" htmlFor="prod-qty">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quantity to Produce
          </span>
          <Input id="prod-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="block" htmlFor="prod-date">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Production Date
          </span>
          <Input
            id="prod-date"
            type="date"
            value={productionDate}
            onChange={(e) => setProductionDate(e.target.value)}
          />
        </label>
      </div>

      {!previewEnabled ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-muted-foreground">
          <Factory className="h-10 w-10 opacity-30" />
          <p className="text-sm">
            Pick a finished good and quantity to see the material requirement
          </p>
        </div>
      ) : previewLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Calculating requirement…
        </div>
      ) : previewError ? (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {previewErrMsg}
        </div>
      ) : preview ? (
        <>
          <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 text-sm font-semibold bg-muted/30">
              Material Requirement — {Number(qty)} × {preview.finished_item_name}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground text-left">
                  <th className="px-4 py-2">Raw Material</th>
                  <th className="px-4 py-2 text-right">Required</th>
                  <th className="px-4 py-2 text-right">Available</th>
                  <th className="px-4 py-2 text-right">Cost</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.requirements.map((r) => (
                  <tr key={r.raw_item_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.required)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(r.available)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <PriceDisplay value={r.cost} currency="" />
                    </td>
                    <td className="px-4 py-2 text-center">
                      {r.sufficient ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                          <Check className="h-3.5 w-3.5" /> OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" /> Short
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 text-sm md:grid-cols-5">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Material</p>
              <PriceDisplay value={preview.material_cost} className="font-semibold" />
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Labor</p>
              <PriceDisplay value={preview.labor_cost} className="font-semibold" />
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Overhead</p>
              <PriceDisplay value={preview.overhead_cost} className="font-semibold" />
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Total Cost</p>
              <PriceDisplay value={preview.total_cost} className="font-bold" />
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Cost / Unit</p>
              <PriceDisplay value={preview.cost_per_unit} className="font-bold text-primary" />
            </div>
          </div>

          {!preview.all_sufficient && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-500">
              <AlertTriangle className="h-4 w-4" /> Not enough raw material in stock — purchase or
              adjust before producing.
            </div>
          )}
        </>
      ) : null}

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => navigate('/manufacturing/production')}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          iconLeft={saving ? undefined : <Factory className="h-4 w-4" />}
          onClick={handleComplete}
          disabled={!preview || !preview.all_sufficient}
        >
          Complete Production
        </Button>
      </div>
    </div>
  );
}
