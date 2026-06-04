import * as React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { uuidv7 } from 'uuidv7';
import { Decimal } from 'decimal.js';
import { ArrowLeft, Check, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';

interface InvoiceLine {
  id: string;
  item_id: string;
  item_name_snapshot: string;
  qty: string;
  unit_id: string;
  rate: string;
  tax_rate_id: string;
  location_id: string;
}
interface InvoiceDetail {
  id: string;
  invoice_no: string;
  customer_name_snapshot: string | null;
  branch_id: string;
  status: string;
  lines: InvoiceLine[];
}

const REASONS = [
  { v: 'damaged', l: 'Damaged' },
  { v: 'wrong_item', l: 'Wrong item' },
  { v: 'customer_cancel', l: 'Customer cancel' },
  { v: 'quality_issue', l: 'Quality issue' },
  { v: 'price_correction', l: 'Price correction' },
  { v: 'other', l: 'Other' },
];
const REFUND_MODES = [
  { v: 'cash', l: 'Cash refund' },
  { v: 'upi', l: 'UPI refund' },
  { v: 'bank', l: 'Bank refund' },
  { v: 'adjust_ledger', l: 'Adjust to ledger' },
  { v: 'replacement', l: 'Replacement' },
];

export function CreditNotePage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const today = new Date().toISOString().slice(0, 10);

  const { data: invoice, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', invoiceId],
    queryFn: () => api.get<InvoiceDetail>(`/invoices/${invoiceId}`),
    enabled: !!invoiceId,
  });

  const [returnQty, setReturnQty] = React.useState<Record<string, string>>({});
  const [restore, setRestore] = React.useState<Record<string, boolean>>({});
  const [reason, setReason] = React.useState('damaged');
  const [refundMode, setRefundMode] = React.useState('adjust_ledger');
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState<{ credit_note_no: string; grand_total: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Default each line's return qty to full + restore on.
  React.useEffect(() => {
    if (invoice && Object.keys(returnQty).length === 0) {
      const q: Record<string, string> = {};
      const r: Record<string, boolean> = {};
      for (const l of invoice.lines) {
        q[l.id] = l.qty;
        r[l.id] = true;
      }
      setReturnQty(q);
      setRestore(r);
    }
  }, [invoice, returnQty]);

  const lines = invoice?.lines ?? [];

  function lineRefund(l: InvoiceLine): string {
    const qty = new Decimal(returnQty[l.id] || '0');
    return qty.times(l.rate || '0').toFixed(2);
  }

  const estTotal = React.useMemo(
    () => lines.reduce((acc, l) => acc.plus(new Decimal(lineRefund(l))), new Decimal('0')).toFixed(2),
    [lines, returnQty],
  );

  async function handleSave() {
    setError(null);
    if (!invoice) return;
    const cnLines = lines
      .filter((l) => Number(returnQty[l.id] ?? '0') > 0)
      .map((l) => ({
        item_id: l.item_id,
        original_line_id: l.id,
        qty: new Decimal(returnQty[l.id]!).toFixed(3),
        unit_id: l.unit_id,
        rate: new Decimal(l.rate).toFixed(2),
        tax_rate_id: l.tax_rate_id,
        location_id: l.location_id,
        restore_stock: restore[l.id] ?? true,
      }));
    if (cnLines.length === 0) {
      setError('Enter a return quantity for at least one line.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ credit_note_no: string; grand_total: string }>('/credit-notes', {
        client_id: uuidv7(),
        branch_id: invoice.branch_id,
        credit_note_date: today,
        original_invoice_id: invoice.id,
        reason,
        refund_mode: refundMode,
        lines: cnLines,
      });
      setSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create credit note');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/invoices')} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold">
          Credit Note <span className="text-muted-foreground font-normal">against {invoice?.invoice_no}</span>
        </h1>
      </div>

      {saved ? (
        <div className="rounded-md bg-success/10 px-4 py-3 text-sm flex items-center gap-2">
          <Check className="h-4 w-4 text-success" />
          <span>
            Credit note <strong>{saved.credit_note_no}</strong> created — ₹{saved.grand_total}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => navigate('/invoices')}>
            Back to Invoices
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Reason</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-muted-foreground">Refund Mode</span>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={refundMode} onChange={(e) => setRefundMode(e.target.value)}>
                {REFUND_MODES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-border overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Item</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Sold Qty</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Rate</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground w-28">Return Qty</th>
                  <th className="px-4 py-2 text-center font-medium text-muted-foreground">Restock</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">Refund</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">{l.item_name_snapshot}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{l.qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={l.rate} currency="" /></td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        className="h-8 text-right tabular-nums"
                        value={returnQty[l.id] ?? ''}
                        onChange={(e) => setReturnQty((p) => ({ ...p, [l.id]: e.target.value }))}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={restore[l.id] ?? true}
                        onChange={(e) => setRestore((p) => ({ ...p, [l.id]: e.target.checked }))}
                        aria-label="Restore stock"
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums"><PriceDisplay value={lineRefund(l)} currency="" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

          <div className="flex items-center justify-end gap-6">
            <div className="text-right">
              <span className="text-sm text-muted-foreground">Refund (excl. tax, est.)</span>
              <PriceDisplay value={estTotal} className="ml-3 font-bold text-lg" />
            </div>
            <Button variant="primary" loading={saving} iconLeft={saving ? undefined : <Save className="h-4 w-4" />} onClick={handleSave}>
              Create Credit Note
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
