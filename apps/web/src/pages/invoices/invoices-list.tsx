import { ShareWhatsAppDialog } from '@/components/share-whatsapp-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateDisplay, PriceDisplay } from '@/components/ui/price-display';
import { api } from '@/lib/api-client';
import { openInvoicePrint } from '@/lib/print';
import { useQuery } from '@tanstack/react-query';
import { Edit, Printer, Receipt, Share2, Undo2 } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

interface InvoiceRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string | null;
  grand_total: string;
  balance_due: string;
  status: string;
  payment_status: string;
  invoice_hash?: string;
  customer_id?: string | null;
}

export function InvoicesListPage() {
  const navigate = useNavigate();
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const query = new URLSearchParams();
  if (from) query.set('date_from', from);
  if (to) query.set('date_to', to);

  const { data, isLoading, error } = useQuery<InvoiceRow[]>({
    queryKey: ['invoices', from, to],
    queryFn: () => api.get<InvoiceRow[]>(`/invoices?${query.toString()}`),
  });
  const invoices = data ?? [];

  const [activeShare, setActiveShare] = React.useState<InvoiceRow | null>(null);
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [loadingId, setLoadingId] = React.useState<string | null>(null);

  async function handleShareClick(inv: InvoiceRow) {
    if (!inv.customer_id) {
      setCustomerPhone('');
      setActiveShare(inv);
      return;
    }

    setLoadingId(inv.id);
    try {
      const c = await api.get<{ phone: string }>(`/customers/${inv.customer_id}`);
      setCustomerPhone(c.phone);
    } catch {
      setCustomerPhone('');
    } finally {
      setLoadingId(null);
      setActiveShare(inv);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Invoices</h1>
        <Button
          variant="primary"
          onClick={() => navigate('/billing')}
          iconLeft={<Receipt className="h-4 w-4" />}
        >
          New Invoice
        </Button>
      </div>

      <div className="flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Loading…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">
            Failed to load invoices
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-30" />
            <p className="font-medium">No invoices</p>
            <p className="text-sm">Ring up a sale in Billing to see it here</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Invoice #
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                  Customer
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Total</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Due</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs">{inv.invoice_no}</td>
                  <td className="px-4 py-2.5">
                    <DateDisplay value={inv.invoice_date} />
                  </td>
                  <td className="px-4 py-2.5">{inv.customer_name ?? 'Walk-in'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <PriceDisplay value={inv.grand_total} currency="" />
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {Number(inv.balance_due) > 0 ? (
                      <PriceDisplay
                        value={inv.balance_due}
                        currency=""
                        className="text-destructive"
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={inv.status === 'voided' ? 'voided' : inv.payment_status} />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {inv.status !== 'voided' && inv.status !== 'fully_returned' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Edit className="h-3.5 w-3.5" />}
                        onClick={() => navigate(`/billing?edit=${inv.id}`)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Printer className="h-3.5 w-3.5" />}
                      onClick={() => openInvoicePrint(inv.id, 'a4')}
                    >
                      Print
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Share2 className="h-3.5 w-3.5" />}
                      loading={loadingId === inv.id}
                      onClick={() => handleShareClick(inv)}
                    >
                      Share
                    </Button>
                    {inv.status !== 'voided' && inv.status !== 'fully_returned' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Undo2 className="h-3.5 w-3.5" />}
                        onClick={() => navigate(`/returns/${inv.id}`)}
                      >
                        Return
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {activeShare && (
        <ShareWhatsAppDialog
          open={!!activeShare}
          onOpenChange={(open) => {
            if (!open) setActiveShare(null);
          }}
          invoiceNo={activeShare.invoice_no}
          grandTotal={activeShare.grand_total}
          invoiceHash={activeShare.invoice_hash || ''}
          defaultPhone={customerPhone}
          customerName={activeShare.customer_name || ''}
        />
      )}
    </div>
  );
}
