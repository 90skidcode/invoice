import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import * as React from 'react';
import { Decimal } from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { usePaymentModes, type PaymentModeData } from '@/hooks/use-payment-modes';

export interface PaymentLine {
  id: string;
  mode: string;
  amount: string;
  reference: string | null;
}

interface PaymentModalProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly grandTotal: string;
  readonly itemCount: number;
  readonly discountAmount: string;
  readonly payments: PaymentLine[];
  readonly onPaymentsChange: (payments: PaymentLine[]) => void;
  readonly onSave: () => Promise<void>;
  readonly saving?: boolean;
}

// Default fallback in case API is unavailable
const DEFAULT_PAYMENT_MODES = [
  { id: '', name: 'Cash', type: 'cash' as const, badge_color: 'bg-green-100 text-green-800' },
  { id: '', name: 'UPI', type: 'upi' as const, badge_color: 'bg-blue-100 text-blue-800' },
  { id: '', name: 'Card', type: 'card' as const, badge_color: 'bg-purple-100 text-purple-800' },
  { id: '', name: 'Bank Transfer', type: 'bank' as const, badge_color: 'bg-amber-100 text-amber-800' },
  { id: '', name: 'Cheque', type: 'cheque' as const, badge_color: 'bg-slate-100 text-slate-800' },
  { id: '', name: 'Credit', type: 'credit' as const, badge_color: 'bg-orange-100 text-orange-800' },
];

export function PaymentModal({
  open,
  onOpenChange,
  grandTotal,
  itemCount,
  discountAmount,
  payments,
  onPaymentsChange,
  onSave,
  saving,
}: PaymentModalProps) {
  const { data: paymentModes, isLoading: modesLoading } = usePaymentModes();
  const modes = paymentModes || DEFAULT_PAYMENT_MODES;

  const [showAddPayment, setShowAddPayment] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [formMode, setFormMode] = React.useState<PaymentLine['mode']>('cash');
  const [formAmount, setFormAmount] = React.useState('');
  const [formReference, setFormReference] = React.useState('');

  const totalPayments = payments.reduce((sum, p) => sum.plus(new Decimal(p.amount || '0')), new Decimal('0'));
  const remainingBalance = new Decimal(grandTotal).minus(totalPayments);

  const handleAddPayment = () => {
    if (!formAmount || new Decimal(formAmount).lte(0)) {
      return;
    }

    if (editingId) {
      // Edit existing
      onPaymentsChange(
        payments.map((p) =>
          p.id === editingId
            ? {
                id: p.id,
                mode: formMode,
                amount: new Decimal(formAmount).toFixed(2),
                reference: formReference || null,
              }
            : p,
        ),
      );
      setEditingId(null);
    } else {
      // Add new
      onPaymentsChange([
        ...payments,
        {
          id: uuidv7(),
          mode: formMode,
          amount: new Decimal(formAmount).toFixed(2),
          reference: formReference || null,
        },
      ]);
    }

    setFormMode('cash');
    setFormAmount('');
    setFormReference('');
    setShowAddPayment(false);
  };

  const handleEditPayment = (payment: PaymentLine) => {
    setFormMode(payment.mode);
    setFormAmount(payment.amount);
    setFormReference(payment.reference || '');
    setEditingId(payment.id);
    setShowAddPayment(true);
  };

  const handleDeletePayment = (id: string) => {
    onPaymentsChange(payments.filter((p) => p.id !== id));
  };

  const handleCancel = () => {
    setShowAddPayment(false);
    setEditingId(null);
    setFormMode('cash');
    setFormAmount('');
    setFormReference('');
  };

  const getModeData = (modeValue: PaymentLine['mode']) => {
    return modes.find((m) => m.type === modeValue);
  };

  const getModeLabel = (mode: PaymentLine['mode']) => {
    return getModeData(mode)?.name || mode;
  };

  const getModeColor = (mode: PaymentLine['mode']) => {
    return getModeData(mode)?.badge_color || 'bg-gray-100 text-gray-800';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add Payments to Invoice" className="max-w-2xl">
        {/* Invoice Summary */}
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Items ({itemCount})</span>
          </div>
          {new Decimal(discountAmount).gt(0) && (
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm text-muted-foreground">Discount</span>
              <span className="text-sm">-<PriceDisplay value={discountAmount} /></span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Grand Total</span>
            <PriceDisplay value={grandTotal} />
          </div>
        </div>

        {/* Payments List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Payments ({payments.length})</h3>
            <span className={`text-sm font-medium ${remainingBalance.gt(0) ? 'text-destructive' : 'text-success'}`}>
              Balance: <PriceDisplay value={remainingBalance.toFixed(2)} />
            </span>
          </div>

          {payments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No payments added yet
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-md border border-border p-3 bg-card hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getModeColor(payment.mode)}`}>
                      {getModeLabel(payment.mode)}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium">
                        <PriceDisplay value={payment.amount} />
                      </div>
                      {payment.reference && (
                        <div className="text-xs text-muted-foreground">{payment.reference}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditPayment(payment)}
                      className="h-8 w-8"
                    >
                      <span className="text-xs">Edit</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeletePayment(payment.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Payment Form */}
        {!showAddPayment ? (
          <Button
            onClick={() => setShowAddPayment(true)}
            variant="outline"
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Payment
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-border p-4 bg-card">
            <div className="grid gap-3">
              <div>
                <label htmlFor="payment-mode" className="text-sm font-medium mb-1.5 block">
                  Payment Mode
                </label>
                <select
                  id="payment-mode"
                  value={formMode}
                  onChange={(e) => setFormMode(e.target.value as PaymentLine['mode'])}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm"
                  disabled={modesLoading}
                >
                  {modes.map((mode) => (
                    <option key={mode.type} value={mode.type}>
                      {mode.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="payment-amount" className="text-sm font-medium mb-1.5 block">
                  Amount
                </label>
                <Input
                  id="payment-amount"
                  type="number"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  step="0.01"
                  min="0"
                  max={remainingBalance.plus(editingId ? payments.find((p) => p.id === editingId)?.amount || '0' : '0').toFixed(2)}
                />
                {editingId ? null : (
                  <div className="text-xs text-muted-foreground mt-1">
                    Remaining: <PriceDisplay value={remainingBalance.toFixed(2)} />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="payment-reference" className="text-sm font-medium mb-1.5 block">
                  Reference (optional)
                </label>
                <Input
                  id="payment-reference"
                  placeholder="e.g., Dhanrani UPI, Check #12345"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAddPayment}
                disabled={!formAmount || new Decimal(formAmount).lte(0)}
              >
                {editingId ? 'Update' : 'Add'}
              </Button>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Invoice'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
