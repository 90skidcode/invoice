import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Boxes, DollarSign, Download, Factory, Loader2, TrendingUp } from 'lucide-react';
import * as React from 'react';
import { DailySalesChart } from './charts';
import { ReportPagination, StatCard, SubTabToggle, firstOfMonth, today, type PageMeta } from './shared';

type ManufSubTab = 'summary' | 'products' | 'consumption';

export default function ManufacturingReport() {
  const [subTab, setSubTab] = React.useState<ManufSubTab>('summary');
  const [from, setFrom] = React.useState(firstOfMonth());
  const [to, setTo] = React.useState(today());
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => { setOffset(0); }, [subTab, from, to]);

  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['rpt-prod', from, to],
    queryFn: () =>
      api.get<{
        totals: {
          count: number;
          produced: string;
          material: string;
          labor: string;
          overhead: string;
          total: string;
        };
        daily: { date: string; count: number; grand: string }[];
      }>(`/reports/production/summary?date_from=${from}&date_to=${to}`),
    enabled: subTab === 'summary',
  });

  const { data: productsData, isLoading: isProductsLoading } = useQuery({
    queryKey: ['rpt-prod-items', from, to, offset],
    queryFn: () =>
      api.get<{
        items: {
          item_id: string;
          name: string;
          runs: number;
          produced: string;
          total_cost: string;
          avg_cost_per_unit: string;
        }[];
        page: PageMeta;
      }>(`/reports/production/by-item?date_from=${from}&date_to=${to}&limit=50&offset=${offset}`),
    enabled: subTab === 'products',
  });

  const { data: consumptionData, isLoading: isConsumptionLoading } = useQuery({
    queryKey: ['rpt-prod-consumption', from, to, offset],
    queryFn: () =>
      api.get<{
        materials: { item_id: string; name: string; qty: string; value: string }[];
        page: PageMeta;
      }>(`/reports/production/consumption?date_from=${from}&date_to=${to}&limit=50&offset=${offset}`),
    enabled: subTab === 'consumption',
  });

  const downloadProductsCSV = () => {
    if (!productsData?.items.length) return;
    const headers = 'Finished Good,Runs,Produced,Total Cost,Avg Cost / Unit\n';
    const rows = productsData.items
      .map(
        (it) =>
          `"${it.name.replace(/"/g, '""')}",${it.runs},${it.produced},${it.total_cost},${it.avg_cost_per_unit}`,
      )
      .join('\n');
    triggerDownload(headers + rows, `production-by-item-${from}-to-${to}.csv`);
  };

  const downloadConsumptionCSV = () => {
    if (!consumptionData?.materials.length) return;
    const headers = 'Raw Material,Qty Consumed,Value\n';
    const rows = consumptionData.materials
      .map((m) => `"${m.name.replace(/"/g, '""')}",${m.qty},${m.value}`)
      .join('\n');
    triggerDownload(headers + rows, `material-consumption-${from}-to-${to}.csv`);
  };

  const isLoading =
    subTab === 'summary'
      ? isSummaryLoading
      : subTab === 'products'
        ? isProductsLoading
        : isConsumptionLoading;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="prod-from-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">From</span>
            <Input
              id="prod-from-date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label htmlFor="prod-to-date" className="block">
            <span className="mb-1 block text-xs text-muted-foreground font-medium">To</span>
            <Input
              id="prod-to-date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <div className="pb-0.5">
            <SubTabToggle
              options={[
                { id: 'summary', label: 'Summary' },
                { id: 'products', label: 'By Product' },
                { id: 'consumption', label: 'Material Use' },
              ]}
              active={subTab}
              onChange={setSubTab}
            />
          </div>
        </div>
        {subTab !== 'summary' && (
          <Button
            variant="outline"
            size="sm"
            disabled={
              isLoading ||
              (subTab === 'products' && !productsData?.items.length) ||
              (subTab === 'consumption' && !consumptionData?.materials.length)
            }
            iconLeft={<Download className="h-4 w-4" />}
            onClick={subTab === 'products' ? downloadProductsCSV : downloadConsumptionCSV}
          >
            Export CSV
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subTab === 'summary' && summaryData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Production Runs"
              value={summaryData.totals.count}
              icon={<Factory className="h-4 w-4" />}
            />
            <StatCard
              label="Units Produced"
              value={Number(summaryData.totals.produced)}
              icon={<Boxes className="h-4 w-4" />}
            />
            <StatCard
              label="Material Cost"
              value={<PriceDisplay value={summaryData.totals.material} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="Total Production Cost"
              value={<PriceDisplay value={summaryData.totals.total} />}
              icon={<TrendingUp className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>

          <DailySalesChart daily={summaryData.daily} />

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Runs</th>
                  <th className="px-4 py-3 text-right">Production Cost</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.daily.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      No production in this period.
                    </td>
                  </tr>
                ) : (
                  summaryData.daily.map((d) => (
                    <tr
                      key={d.date}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{d.date}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.count}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={d.grand} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : subTab === 'products' && productsData ? (
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Finished Good</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Runs</th>
                  <th className="px-4 py-3 text-right">Produced</th>
                  <th className="px-4 py-3 text-right">Total Cost</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Avg Cost / Unit</th>
                </tr>
              </thead>
              <tbody>
                {productsData.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No production in this period.
                    </td>
                  </tr>
                ) : (
                  productsData.items.map((it) => (
                    <tr
                      key={it.item_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{it.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {it.runs}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(it.produced)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <PriceDisplay value={it.total_cost} currency="" />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-primary hidden md:table-cell">
                        <PriceDisplay value={it.avg_cost_per_unit} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {productsData.page && <ReportPagination page={productsData.page} onPageChange={setOffset} />}
        </>
      ) : subTab === 'consumption' && consumptionData ? (
        <>
          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Raw Material</th>
                  <th className="px-4 py-3 text-right">Qty Consumed</th>
                  <th className="px-4 py-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {consumptionData.materials.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-muted-foreground">
                      No material consumed in this period.
                    </td>
                  </tr>
                ) : (
                  consumptionData.materials.map((m) => (
                    <tr
                      key={m.item_id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(m.qty)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">
                        <PriceDisplay value={m.value} currency="" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {consumptionData.page && <ReportPagination page={consumptionData.page} onPageChange={setOffset} />}
        </>
      ) : null}
    </div>
  );
}

function triggerDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.click();
  URL.revokeObjectURL(url);
}
