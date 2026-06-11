import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface ItemLookup {
  id: string;
  sku: string;
  name: string;
  sale_price: string;
  unit: string;
  tax_rate_id: string;
}

interface UnitOption {
  id: string;
  name: string;
  abbreviation: string;
}

interface BomDetailLine {
  id: string;
  raw_item_id: string;
  raw_item_name: string;
  qty: string;
  unit_id: string;
  unit_symbol: string | null;
  wastage_pct: string;
}

interface BomDetail {
  id: string;
  finished_item_id: string;
  name: string | null;
  version: number;
  output_qty: string;
  output_unit_id: string;
  labor_cost: string;
  overhead_cost: string;
  notes: string | null;
  is_active: boolean;
  lines: BomDetailLine[];
}

interface RecipeLine {
  key: string;
  raw_item_id: string | null;
  raw_item_name: string;
  qty: string;
  unit_id: string | null;
  wastage_pct: string;
}

function emptyLine(): RecipeLine {
  return {
    key: crypto.randomUUID(),
    raw_item_id: null,
    raw_item_name: '',
    qty: '0',
    unit_id: null,
    wastage_pct: '0',
  };
}

function ItemSearch({
  defaultQuery,
  placeholder,
  onSelect,
}: Readonly<{ defaultQuery?: string; placeholder: string; onSelect: (i: ItemLookup) => void }>) {
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
        placeholder={placeholder}
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

const selectClass =
  'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function BomFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: editId } = useParams<{ id?: string }>();

  const [finishedItem, setFinishedItem] = React.useState<{ id: string; name: string } | null>(null);
  const [name, setName] = React.useState('');
  const [outputQty, setOutputQty] = React.useState('1');
  const [outputUnitId, setOutputUnitId] = React.useState('');
  const [laborCost, setLaborCost] = React.useState('0');
  const [overheadCost, setOverheadCost] = React.useState('0');
  const [isActive, setIsActive] = React.useState(true);
  const [lines, setLines] = React.useState<RecipeLine[]>([emptyLine()]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: units } = useQuery<UnitOption[]>({
    queryKey: ['units'],
    queryFn: () => api.get<UnitOption[]>('/units'),
  });

  const { data: editDetail, isLoading: detailLoading } = useQuery<BomDetail>({
    queryKey: ['bom-detail', editId],
    queryFn: () => api.get<BomDetail>(`/boms/${editId}`),
    enabled: !!editId,
  });

  React.useEffect(() => {
    if (!editDetail) return;
    setName(editDetail.name ?? '');
    setOutputQty(editDetail.output_qty);
    setOutputUnitId(editDetail.output_unit_id);
    setLaborCost(editDetail.labor_cost);
    setOverheadCost(editDetail.overhead_cost);
    setIsActive(editDetail.is_active);
    // finished item name is shown read-only in edit mode (BOM is keyed to it).
    setFinishedItem({ id: editDetail.finished_item_id, name: '' });
    setLines(
      editDetail.lines.map((l) => ({
        key: crypto.randomUUID(),
        raw_item_id: l.raw_item_id,
        raw_item_name: l.raw_item_name,
        qty: l.qty,
        unit_id: l.unit_id,
        wastage_pct: l.wastage_pct,
      })),
    );
    setError(null);
  }, [editDetail]);

  // Default the output unit once units are loaded (create mode).
  React.useEffect(() => {
    const first = units?.[0];
    if (!editId && first && !outputUnitId) {
      setOutputUnitId(first.id);
    }
  }, [units, editId, outputUnitId]);

  function updateLine(key: string, patch: Partial<RecipeLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function handleSave() {
    setError(null);
    if (!editId && !finishedItem) {
      setError('Select the finished good this recipe produces.');
      return;
    }
    const finishedItemId = finishedItem?.id;
    if (Number(outputQty) <= 0) {
      setError('Output quantity must be greater than zero.');
      return;
    }
    if (!outputUnitId) {
      setError('Select an output unit.');
      return;
    }
    const validLines = lines.filter((l) => l.raw_item_id && Number(l.qty) > 0 && l.unit_id);
    if (validLines.length === 0) {
      setError('Add at least one raw material with a quantity.');
      return;
    }
    setSaving(true);
    try {
      const payloadLines = validLines.map((l) => ({
        raw_item_id: l.raw_item_id,
        qty: l.qty,
        unit_id: l.unit_id,
        wastage_pct: l.wastage_pct || '0',
      }));

      if (editId) {
        await api.patch(`/boms/${editId}`, {
          name: name || null,
          output_qty: outputQty,
          output_unit_id: outputUnitId,
          labor_cost: laborCost || '0',
          overhead_cost: overheadCost || '0',
          is_active: isActive,
          lines: payloadLines,
        });
        await queryClient.invalidateQueries({ queryKey: ['bom-detail', editId] });
      } else {
        await api.post('/boms', {
          finished_item_id: finishedItemId,
          name: name || null,
          output_qty: outputQty,
          output_unit_id: outputUnitId,
          labor_cost: laborCost || '0',
          overhead_cost: overheadCost || '0',
          is_active: isActive,
          lines: payloadLines,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['boms-list'] });
      navigate('/manufacturing/boms', {
        state: { saved: `Recipe ${editId ? 'updated' : 'created'}.` },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save BOM');
      setSaving(false);
    }
  }

  if (editId && detailLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Back to BOMs"
          onClick={() => navigate('/manufacturing/boms')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          {editId ? `Edit Recipe${editDetail ? ` (v${editDetail.version})` : ''}` : 'New Recipe'}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-4">
        <div className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Finished Good
          </span>
          {editId ? (
            <div className="flex h-9 items-center rounded-md border border-border px-3 text-sm text-muted-foreground">
              {editDetail?.name || 'Linked finished good'}
            </div>
          ) : (
            <ItemSearch
              placeholder="Search finished good…"
              onSelect={(item) => {
                setFinishedItem({ id: item.id, name: item.name });
                if (!name) setName(`${item.name} recipe`);
              }}
            />
          )}
        </div>
        <label className="block" htmlFor="bom-name">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recipe Name
          </span>
          <Input id="bom-name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block" htmlFor="bom-output-qty">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Batch Yields
          </span>
          <Input
            id="bom-output-qty"
            type="number"
            value={outputQty}
            onChange={(e) => setOutputQty(e.target.value)}
          />
        </label>
        <label className="block" htmlFor="bom-output-unit">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Output Unit
          </span>
          <select
            id="bom-output-unit"
            className={selectClass}
            value={outputUnitId}
            onChange={(e) => setOutputUnitId(e.target.value)}
          >
            <option value="">—</option>
            {(units ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.abbreviation} ({u.name})
              </option>
            ))}
          </select>
        </label>
        <label className="block" htmlFor="bom-labor">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Labor Cost / Batch
          </span>
          <Input
            id="bom-labor"
            type="number"
            prefix="₹"
            value={laborCost}
            onChange={(e) => setLaborCost(e.target.value)}
          />
        </label>
        <label className="block" htmlFor="bom-overhead">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Overhead / Batch
          </span>
          <Input
            id="bom-overhead"
            type="number"
            prefix="₹"
            value={overheadCost}
            onChange={(e) => setOverheadCost(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-1.5" htmlFor="bom-active">
          <input
            id="bom-active"
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm font-medium">Active recipe</span>
        </label>
      </div>

      <div className="flex-1 rounded-lg border border-border bg-card overflow-visible">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold bg-muted/30">
          Raw Materials (per batch)
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-8">#</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                Raw Material
              </th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-36">Qty</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-36">Unit</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">
                Wastage %
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={line.key} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                <td className="px-3 py-1.5">
                  <ItemSearch
                    defaultQuery={line.raw_item_name}
                    placeholder="Raw material name or SKU…"
                    onSelect={(item) =>
                      updateLine(line.key, {
                        raw_item_id: item.id,
                        raw_item_name: item.name,
                        unit_id: line.unit_id ?? item.unit,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-1.5 w-36">
                  <Input
                    type="number"
                    className="h-8 w-full text-right tabular-nums"
                    selectOnFocus
                    value={line.qty}
                    onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    className={selectClass}
                    value={line.unit_id ?? ''}
                    onChange={(e) => updateLine(line.key, { unit_id: e.target.value })}
                  >
                    <option value="">—</option>
                    {(units ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.abbreviation}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    className="h-8 text-right tabular-nums"
                    selectOnFocus
                    value={line.wastage_pct}
                    onChange={(e) => updateLine(line.key, { wastage_pct: e.target.value })}
                  />
                </td>
                <td className="px-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setLines((p) => (p.length === 1 ? p : p.filter((x) => x.key !== line.key)))
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
            Add Material
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/manufacturing/boms')} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          loading={saving}
          iconLeft={saving ? undefined : <Save className="h-4 w-4" />}
          onClick={handleSave}
        >
          {editId ? 'Update Recipe' : 'Save Recipe'}
        </Button>
      </div>
    </div>
  );
}
