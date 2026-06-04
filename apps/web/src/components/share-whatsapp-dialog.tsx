import * as React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ShareWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNo: string;
  grandTotal: string;
  invoiceHash: string;
  defaultPhone?: string | null | undefined;
  customerName?: string | null | undefined;
}

export function ShareWhatsAppDialog({
  open,
  onOpenChange,
  invoiceNo,
  grandTotal,
  invoiceHash,
  defaultPhone = '',
  customerName = '',
}: Readonly<ShareWhatsAppDialogProps>) {
  const [phone, setPhone] = React.useState('');
  const [message, setMessage] = React.useState('');

  // Prefill fields when open changes
  React.useEffect(() => {
    if (open) {
      // Clean phone number from whitespace / non-digits, and set default
      const cleanPhone = (defaultPhone || '').replace(/[^0-9]/g, '');
      setPhone(cleanPhone);

      // Construct default message
      const apiBase = import.meta.env['VITE_API_URL'] || window.location.origin;
      const serverRoot = apiBase.replace(/\/v1$/, '');
      const publicInvoiceUrl = `${serverRoot}/public/invoices/${invoiceHash}/print?paper=a4`;

      const defaultMessage = `Hello ${customerName || 'Customer'},\n\nThanks for shopping with CocoGlo!\nHere are your invoice details:\n\nInvoice No: ${invoiceNo}\nTotal Amount: ₹${grandTotal}\n\nYou can view/print your invoice online:\n${publicInvoiceUrl}\n\nThank you!`;
      setMessage(defaultMessage);
    }
  }, [open, defaultPhone, customerName, invoiceNo, grandTotal, invoiceHash]);

  const handleSend = () => {
    // Format phone: if 10 digits, prepend '91' (assuming India country code default)
    let formattedPhone = phone.replace(/[^0-9]/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = `91${formattedPhone}`;
    }

    const encodedText = encodeURIComponent(message);
    const waUrl = `https://wa.me/${formattedPhone}?text=${encodedText}`;
    
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" title="Share Invoice via WhatsApp">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="wa-phone" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              WhatsApp Number
            </label>
            <Input
              id="wa-phone"
              placeholder="e.g. 9876543210 (10-digit number)"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9+]/g, ''))}
            />
            <p className="text-xs text-muted-foreground">
              Country code (e.g. 91 for India) is required. If 10 digits are entered, we automatically prepend 91.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="wa-message" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Message Preview
            </label>
            <textarea
              id="wa-message"
              className="flex min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!phone}
              onClick={handleSend}
            >
              Send on WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
