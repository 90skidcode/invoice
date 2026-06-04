import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PriceDisplay } from '@/components/ui/price-display';
import { customerFormSchema } from '@/forms/customer.form';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users } from 'lucide-react';
import * as React from 'react';
import { uuidv7 } from 'uuidv7';

interface CustomerRow {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  gstin: string | null;
  credit_limit: string | null;
  status: string;
}

interface CustomerDetail {
  id: string;
  name: string;
  type: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  gst_reg_type: string;
  credit_limit: string | null;
  credit_days: number | null;
  block_on_limit_breach: boolean;
  opening_balance: string | null;
  status: string;
  row_version: number;
}

export function CustomersListPage() {
  const [search, setSearch] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editVersion, setEditVersion] = React.useState<number | null>(null);
  const [initialValues, setInitialValues] = React.useState<FormValues | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<CustomerRow[]>({
    queryKey: ['customers', search],
    queryFn: () => api.get<CustomerRow[]>(`/customers?q=${encodeURIComponent(search)}`),
    enabled: search.length >= 2 || search.length === 0,
  });

  const customers = data ?? [];

  function openCreate() {
    setEditId(null);
    setEditVersion(null);
    setInitialValues(undefined);
    setFormError(null);
    setFormOpen(true);
  }

  async function openEdit(id: string) {
    setFormError(null);
    try {
      const c = await api.get<CustomerDetail>(`/customers/${id}`);
      setEditId(c.id);
      setEditVersion(c.row_version);
      setInitialValues({
        name: c.name,
        type: c.type,
        phone: c.phone,
        email: c.email ?? '',
        gstin: c.gstin ?? '',
        gst_reg_type: c.gst_reg_type,
        credit_limit: c.credit_limit ?? '0.00',
        credit_days: c.credit_days ?? 0,
        block_on_limit_breach: c.block_on_limit_breach,
        opening_balance: c.opening_balance ?? '0.00',
        status: c.status,
      });
      setFormOpen(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load customer');
    }
  }

  async function handleSubmit(values: FormValues) {
    setFormError(null);
    setSaving(true);
    const payload = {
      name: values['name'],
      type: values['type'] || 'Individual',
      phone: values['phone'],
      email: values['email'] || null,
      gstin: values['gstin'] || null,
      gst_reg_type: values['gst_reg_type'] || 'Consumer',
      credit_limit: String(values['credit_limit'] ?? '0.00'),
      credit_days: Number(values['credit_days'] ?? 0),
      block_on_limit_breach: !!values['block_on_limit_breach'],
      opening_balance: String(values['opening_balance'] ?? '0.00'),
      status: values['status'] || 'Active',
    };
    try {
      if (editId && editVersion !== null) {
        await api.patch(`/customers/${editId}`, payload, editVersion);
      } else {
        await api.post('/customers', { client_id: uuidv7(), ...payload });
      }
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Customers</h1>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={openCreate}
        >
          Add Customer
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" title={editId ? 'Edit Customer' : 'New Customer'}>
          <FormRenderer
            key={editId ?? 'new'}
            schema={customerFormSchema}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={saving}
            error={formError}
          />
        </DialogContent>
      </Dialog>

      <div className="flex gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
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
            Failed to load customers
          </div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Users className="h-10 w-10 opacity-30" />
            <p className="font-medium">No customers yet</p>
            <p className="text-sm">Add your first customer to bill on credit</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">GSTIN</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">
                  Credit Limit
                </th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {c.customer_code}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="px-4 py-2.5 tabular-nums">{c.phone}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{c.gstin ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {c.credit_limit && Number(c.credit_limit) > 0 ? (
                      <PriceDisplay value={c.credit_limit} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge status={c.status.toLowerCase()} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c.id)}>
                      Edit
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
