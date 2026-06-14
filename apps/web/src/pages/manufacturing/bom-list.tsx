import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Search, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ManufacturingNav } from './manufacturing-nav';

interface BomRow {
  id: string;
  finished_item_id: string;
  finished_item_name: string;
  finished_item_sku: string;
  name: string | null;
  version: number;
  output_qty: string;
  is_active: boolean;
  status: string;
  line_count: number;
  updated_at: string;
}

export function BomListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [savedNotice, setSavedNotice] = React.useState<string | null>(
    (location.state as { saved?: string } | null)?.saved ?? null,
  );

  React.useEffect(() => {
    if ((location.state as { saved?: string } | null)?.saved) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const { data, isLoading, error } = useQuery<BomRow[]>({
    queryKey: ['boms-list'],
    queryFn: () => api.get<BomRow[]>('/boms?limit=200'),
  });

  const boms = React.useMemo(() => {
    const all = data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (b) =>
        b.finished_item_name.toLowerCase().includes(q) ||
        b.finished_item_sku.toLowerCase().includes(q) ||
        (b.name ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete BOM "${name}"? This cannot be undone.`)) return;
    await api.delete(`/boms/${id}`);
    await queryClient.invalidateQueries({ queryKey: ['boms-list'] });
  }

  return (
    <div className="space-y-4">
      <ManufacturingNav />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Bill of Materials</h1>
          <p className="text-sm text-muted-foreground">
            Recipes that define how finished goods are made
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={() => navigate('/manufacturing/boms/new')}
        >
          New BOM
        </Button>
      </div>

      {savedNotice && (
        <div className="flex items-center gap-2 rounded-md bg-success/10 px-4 py-3 text-sm">
          <span>{savedNotice}</span>
          <button
            type="button"
            className="ml-auto text-xs text-muted-foreground hover:underline"
            onClick={() => setSavedNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search finished good…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">
            Failed to load BOMs
          </div>
        ) : boms.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Layers className="h-10 w-10 opacity-30" />
            <p className="font-medium">No recipes yet</p>
            <p className="text-sm">Define a BOM to start manufacturing finished goods</p>
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus className="h-4 w-4" />}
              onClick={() => navigate('/manufacturing/boms/new')}
            >
              New BOM
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Finished Good</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Version</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Yields</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Materials</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground hidden md:table-cell">Active</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {boms.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">
                    {b.finished_item_name}
                    <div className="font-mono text-xs text-muted-foreground mt-0.5">{b.finished_item_sku}</div>
                    <div className="md:hidden text-xs text-muted-foreground mt-0.5">v{b.version} · {b.line_count} materials</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">v{b.version}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">{Number(b.output_qty)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">{b.line_count}</td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    {b.is_active ? (
                      <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/manufacturing/boms/${b.id}/edit`)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Delete BOM"
                      onClick={() => handleDelete(b.id, b.finished_item_name)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
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
