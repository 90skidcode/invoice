import { Button } from '@/components/ui/button';
import { DateDisplay, PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Factory, Plus } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ManufacturingNav } from './manufacturing-nav';

interface ProductionRow {
  id: string;
  voucher_no: string;
  production_date: string;
  finished_item_id: string;
  finished_item_name: string;
  finished_item_sku: string;
  produced_qty: string;
  total_cost: string;
  cost_per_unit: string;
  status: string;
}

export function ProductionListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [savedNotice, setSavedNotice] = React.useState<string | null>(
    (location.state as { saved?: string } | null)?.saved ?? null,
  );

  React.useEffect(() => {
    if ((location.state as { saved?: string } | null)?.saved) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const { data, isLoading, error } = useQuery<ProductionRow[]>({
    queryKey: ['production-list'],
    queryFn: () => api.get<ProductionRow[]>('/production-orders?limit=200'),
  });
  const orders = data ?? [];

  async function handleCancel(o: ProductionRow) {
    if (
      !window.confirm(
        `Cancel ${o.voucher_no}? Raw materials will return to stock and ${Number(o.produced_qty)} unit(s) of ${o.finished_item_name} will be removed.`,
      )
    ) {
      return;
    }
    setActionError(null);
    setCancellingId(o.id);
    try {
      await api.post(`/production-orders/${o.id}/cancel`, {});
      await queryClient.invalidateQueries({ queryKey: ['production-list'] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel production');
    } finally {
      setCancellingId(null);
    }
  }

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>
    );
  } else if (error) {
    body = (
      <div className="flex items-center justify-center py-12 text-destructive">
        Failed to load production runs
      </div>
    );
  } else if (orders.length === 0) {
    body = (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <Factory className="h-10 w-10 opacity-30" />
        <p className="font-medium">No production runs yet</p>
        <p className="text-sm">Manufacture a finished good to consume raw materials</p>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={() => navigate('/manufacturing/production/new')}
        >
          New Production
        </Button>
      </div>
    );
  } else {
    body = (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Production</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Qty</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Cost / Unit</th>
            <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Total Cost</th>
            <th className="px-4 py-2.5 text-center font-medium text-muted-foreground hidden md:table-cell">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const cancelled = o.status === 'cancelled';
            return (
              <tr
                key={o.id}
                className={cn(
                  'border-b border-border last:border-0 hover:bg-muted/30',
                  cancelled && 'opacity-60',
                )}
              >
                <td className="px-4 py-2.5 font-medium">
                  {o.finished_item_name}
                  <div className="font-mono text-xs text-muted-foreground mt-0.5">{o.voucher_no}</div>
                  <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                    <DateDisplay value={o.production_date} />
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{Number(o.produced_qty)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">
                  <PriceDisplay value={o.cost_per_unit} currency="" />
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold hidden md:table-cell">
                  <PriceDisplay value={o.total_cost} currency="" />
                </td>
                <td className="px-4 py-2.5 text-center hidden md:table-cell">
                  {cancelled ? (
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Cancelled
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      Completed
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {!cancelled && (
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={cancellingId === o.id}
                      iconLeft={<Ban className="h-3.5 w-3.5" />}
                      onClick={() => handleCancel(o)}
                    >
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-4">
      <ManufacturingNav />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Production</h1>
          <p className="text-sm text-muted-foreground">
            Manufacturing runs — consumes raw materials, outputs finished goods
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={() => navigate('/manufacturing/production/new')}
        >
          New Production
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

      {actionError && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-auto">{body}</div>
    </div>
  );
}
