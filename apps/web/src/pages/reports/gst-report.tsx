import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  DollarSign,
  Download,
  Loader2,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { StatCard, SubTabToggle, currentPeriod } from './shared';

type GstSubTab = 'sales' | 'purchase' | 'gstr3b';

export default function GstReport() {
  const [gstTab, setGstTab] = React.useState<GstSubTab>('sales');
  const [period, setPeriod] = React.useState(currentPeriod());

  const { data, isLoading: isSalesLoading } = useQuery({
    queryKey: ['rpt-gst', period],
    queryFn: () =>
      api.get<{
        b2b: { count: number; taxable: string; tax: string };
        b2c: { count: number; taxable: string; tax: string };
        totals: { taxable: string; cgst: string; sgst: string; igst: string; grand: string };
        hsn_summary: {
          hsn_code: string;
          gst_rate: string;
          taxable: string;
          cgst: string;
          sgst: string;
          igst: string;
        }[];
      }>(`/reports/gst/gstr1?period=${period}`),
    enabled: gstTab === 'sales',
  });

  const { data: purData, isLoading: isPurLoading } = useQuery({
    queryKey: ['rpt-gst-purchase', period],
    queryFn: () =>
      api.get<{
        totals: {
          count: number;
          taxable: string;
          cgst: string;
          sgst: string;
          igst: string;
          grand: string;
        };
        hsn_summary: {
          hsn_code: string;
          gst_rate: string;
          taxable: string;
          cgst: string;
          sgst: string;
          igst: string;
        }[];
      }>(`/reports/gst/purchase?period=${period}`),
    enabled: gstTab === 'purchase',
  });

  const { data: gstr3bData, isLoading: isGstr3bLoading } = useQuery({
    queryKey: ['rpt-gst-gstr3b', period],
    queryFn: () =>
      api.get<{
        period: string;
        from: string;
        to: string;
        output: { taxable: string; cgst: string; sgst: string; igst: string; cess: string };
        input_credit: { taxable: string; cgst: string; sgst: string; igst: string };
        net_output_tax: string;
        total_itc: string;
        net_tax_payable: string;
      }>(`/reports/gst/gstr3b?period=${period}`),
    enabled: gstTab === 'gstr3b',
  });

  const isLoading =
    gstTab === 'sales' ? isSalesLoading : gstTab === 'purchase' ? isPurLoading : isGstr3bLoading;

  const downloadCSV = () => {
    const hsn = gstTab === 'sales' ? data?.hsn_summary : purData?.hsn_summary;
    if (!hsn?.length) return;
    const headers = 'HSN,Rate,Taxable,CGST,SGST,IGST\n';
    const rows = hsn
      .map((h) => `${h.hsn_code},${h.gst_rate},${h.taxable},${h.cgst},${h.sgst},${h.igst}`)
      .join('\n');
    triggerDownload(headers + rows, `gst-${gstTab}-${period}.csv`);
  };

  const b2bTaxable = data ? Number(data.b2b.taxable) : 0;
  const b2cTaxable = data ? Number(data.b2c.taxable) : 0;
  const totalTaxable = b2bTaxable + b2cTaxable || 1;
  const pctB2B = (b2bTaxable / totalTaxable) * 100;
  const pctB2C = (b2cTaxable / totalTaxable) * 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <SubTabToggle
          options={[
            { id: 'sales', label: 'GSTR-1 (Sales)' },
            { id: 'purchase', label: 'Purchase GST' },
            { id: 'gstr3b', label: 'GSTR-3B' },
          ]}
          active={gstTab}
          onChange={setGstTab}
        />
        <label htmlFor="gst-period" className="block w-36">
          <span className="mb-1 block text-xs text-muted-foreground font-medium">
            Period (YYYY-MM)
          </span>
          <Input
            id="gst-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="2026-05"
          />
        </label>
        <div className="self-end ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={
              isLoading ||
              (gstTab === 'sales' && !data?.hsn_summary.length) ||
              (gstTab === 'purchase' && !purData?.hsn_summary.length) ||
              (gstTab === 'gstr3b' && !gstr3bData)
            }
            iconLeft={<Download className="h-4 w-4" />}
            onClick={
              gstTab !== 'gstr3b'
                ? downloadCSV
                : () => {
                    if (!gstr3bData) return;
                    const rows = [
                      'Section,Taxable,CGST,SGST,IGST',
                      `Output (Net of Returns),${gstr3bData.output.taxable},${gstr3bData.output.cgst},${gstr3bData.output.sgst},${gstr3bData.output.igst}`,
                      `Input Tax Credit,${gstr3bData.input_credit.taxable},${gstr3bData.input_credit.cgst},${gstr3bData.input_credit.sgst},${gstr3bData.input_credit.igst}`,
                      `Net Tax Payable,,,,${gstr3bData.net_tax_payable}`,
                    ].join('\n');
                    triggerDownload(rows, `gstr3b-${period}.csv`);
                  }
            }
          >
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : gstTab === 'sales' && data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="B2B Invoices" value={data.b2b.count} icon={<Users className="h-4 w-4" />} />
            <StatCard label="B2C Invoices" value={data.b2c.count} icon={<Users className="h-4 w-4" />} />
            <StatCard
              label="Taxable Amount"
              value={<PriceDisplay value={data.totals.taxable} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="Grand Total"
              value={<PriceDisplay value={data.totals.grand} />}
              icon={<TrendingUp className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:shadow-md transition-shadow duration-200">
            <div className="flex justify-between items-center text-xs font-semibold uppercase text-muted-foreground">
              <span>B2B Sales ({pctB2B.toFixed(0)}%)</span>
              <span>B2C Sales ({pctB2C.toFixed(0)}%)</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {pctB2B > 0 && (
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${pctB2B}%` }}
                />
              )}
              {pctB2C > 0 && (
                <div
                  className="bg-sky-400 h-full transition-all duration-500"
                  style={{ width: `${pctB2C}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />{' '}
                <PriceDisplay value={data.b2b.taxable} /> ({data.b2b.count} invs)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />{' '}
                <PriceDisplay value={data.b2c.taxable} /> ({data.b2c.count} invs)
              </span>
            </div>
          </div>

          <HsnTable title="HSN Summary" rows={data.hsn_summary} />
        </>
      ) : gstTab === 'purchase' && purData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Purchase Bills"
              value={purData.totals.count}
              icon={<ShoppingCart className="h-4 w-4" />}
            />
            <StatCard
              label="Taxable Amount"
              value={<PriceDisplay value={purData.totals.taxable} />}
              icon={<DollarSign className="h-4 w-4" />}
            />
            <StatCard
              label="GST Input Credit"
              value={
                <PriceDisplay
                  value={(
                    Number(purData.totals.cgst) +
                    Number(purData.totals.sgst) +
                    Number(purData.totals.igst)
                  ).toFixed(2)}
                />
              }
              icon={<Receipt className="h-4 w-4" />}
              className="bg-emerald-500/5 border-emerald-500/20"
            />
            <StatCard
              label="Grand Total"
              value={<PriceDisplay value={purData.totals.grand} />}
              icon={<TrendingUp className="h-4 w-4" />}
              className="bg-primary/5 border-primary/20"
            />
          </div>
          <HsnTable title="HSN Summary — Purchase Input" rows={purData.hsn_summary} emptyMessage="No purchase data for this period." />
        </>
      ) : gstTab === 'gstr3b' && gstr3bData ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard
              label="Net Output Tax"
              value={<PriceDisplay value={gstr3bData.net_output_tax} />}
              icon={<Receipt className="h-4 w-4" />}
              className="bg-rose-500/5 border-rose-500/20"
            />
            <StatCard
              label="Total ITC Available"
              value={<PriceDisplay value={gstr3bData.total_itc} />}
              icon={<ShoppingCart className="h-4 w-4" />}
              className="bg-emerald-500/5 border-emerald-500/20"
            />
            <StatCard
              label="Net Tax Payable"
              value={<PriceDisplay value={gstr3bData.net_tax_payable} />}
              icon={<DollarSign className="h-4 w-4" />}
              className={
                Number(gstr3bData.net_tax_payable) > 0
                  ? 'bg-rose-500/5 border-rose-500/20'
                  : 'bg-emerald-500/5 border-emerald-500/20'
              }
            />
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 font-semibold text-sm bg-muted/30">
              Table 3.1 — Outward Taxable Supplies (Net of Returns)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Taxable Value</th>
                  <th className="px-4 py-3 text-right">CGST</th>
                  <th className="px-4 py-3 text-right">SGST</th>
                  <th className="px-4 py-3 text-right">IGST</th>
                  <th className="px-4 py-3 text-right">Cess</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 tabular-nums font-semibold">
                    <PriceDisplay value={gstr3bData.output.taxable} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <PriceDisplay value={gstr3bData.output.cgst} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <PriceDisplay value={gstr3bData.output.sgst} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <PriceDisplay value={gstr3bData.output.igst} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    <PriceDisplay value={gstr3bData.output.cess} currency="" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3 font-semibold text-sm bg-muted/30">
              Table 4 — Eligible Input Tax Credit
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
                  <th className="px-4 py-3">Taxable Value (Purchases)</th>
                  <th className="px-4 py-3 text-right">CGST Credit</th>
                  <th className="px-4 py-3 text-right">SGST Credit</th>
                  <th className="px-4 py-3 text-right">IGST Credit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 tabular-nums font-semibold">
                    <PriceDisplay value={gstr3bData.input_credit.taxable} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    <PriceDisplay value={gstr3bData.input_credit.cgst} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    <PriceDisplay value={gstr3bData.input_credit.sgst} currency="" />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    <PriceDisplay value={gstr3bData.input_credit.igst} currency="" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
            <span className="text-sm font-semibold">Net GST Payable (Output Tax − ITC)</span>
            <span
              className={cn(
                'text-xl font-bold tabular-nums',
                Number(gstr3bData.net_tax_payable) > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              <PriceDisplay value={gstr3bData.net_tax_payable} />
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function HsnTable({
  title,
  rows,
  emptyMessage = 'No data for this period.',
}: Readonly<{
  title: string;
  rows: { hsn_code: string; gst_rate: string; taxable: string; cgst: string; sgst: string; igst: string }[];
  emptyMessage?: string;
}>) {
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div className="border-b border-border px-4 py-3 text-sm font-semibold bg-muted/30">
        {title}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
            <th className="px-4 py-3">HSN</th>
            <th className="px-4 py-3 text-right">Rate</th>
            <th className="px-4 py-3 text-right">Taxable</th>
            <th className="px-4 py-3 text-right hidden md:table-cell">CGST</th>
            <th className="px-4 py-3 text-right hidden md:table-cell">SGST</th>
            <th className="px-4 py-3 text-right hidden md:table-cell">IGST</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((h, i) => (
              <tr
                key={`${h.hsn_code}-${h.gst_rate}-${i}`}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 font-medium">
                  {!h.hsn_code || h.hsn_code === 'NA' ? (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-500 border border-amber-500/20">
                      <AlertTriangle className="h-3 w-3" /> Missing HSN
                    </span>
                  ) : (
                    <span className="font-mono">{h.hsn_code}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{h.gst_rate}%</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <PriceDisplay value={h.taxable} currency="" />
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <PriceDisplay value={h.cgst} currency="" />
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <PriceDisplay value={h.sgst} currency="" />
                </td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <PriceDisplay value={h.igst} currency="" />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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
