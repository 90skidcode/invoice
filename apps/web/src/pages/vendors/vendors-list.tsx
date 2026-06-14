import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { vendorFormSchema } from '@/forms/vendor.form';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Truck } from 'lucide-react';
import * as React from 'react';
import { uuidv7 } from 'uuidv7';

interface VendorRow {
  id: string;
  vendor_code: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  status: string;
}

interface VendorDetail extends VendorRow {
  type: string;
  email: string | null;
  pan: string | null;
  credit_days: number | null;
  opening_balance: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  upi_id: string | null;
  row_version: number;
}

export function VendorsListPage() {
  const [search, setSearch] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editVersion, setEditVersion] = React.useState<number | null>(null);
  const [initialValues, setInitialValues] = React.useState<FormValues | undefined>(undefined);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<VendorRow[]>({
    queryKey: ['vendors', search],
    queryFn: () => api.get<VendorRow[]>(`/vendors?q=${encodeURIComponent(search)}`),
    enabled: search.length >= 2 || search.length === 0,
  });
  const vendors = data ?? [];

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
      const v = await api.get<VendorDetail>(`/vendors/${id}`);
      setEditId(v.id);
      setEditVersion(v.row_version);
      setInitialValues({
        name: v.name,
        type: v.type,
        phone: v.phone ?? '',
        email: v.email ?? '',
        gstin: v.gstin ?? '',
        pan: v.pan ?? '',
        credit_days: v.credit_days ?? 0,
        opening_balance: v.opening_balance ?? '0.00',
        bank_name: v.bank_name ?? '',
        bank_account_no: v.bank_account_no ?? '',
        bank_ifsc: v.bank_ifsc ?? '',
        upi_id: v.upi_id ?? '',
        status: v.status,
      });
      setFormOpen(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load vendor');
    }
  }

  async function handleSubmit(values: FormValues) {
    setFormError(null);
    setSaving(true);
    const payload = {
      name: values['name'],
      type: values['type'] || 'Business',
      phone: values['phone'] || null,
      email: values['email'] || null,
      gstin: values['gstin'] || null,
      pan: values['pan'] || null,
      credit_days: Number(values['credit_days'] ?? 0),
      opening_balance: String(values['opening_balance'] ?? '0.00'),
      bank_name: values['bank_name'] || null,
      bank_account_no: values['bank_account_no'] || null,
      bank_ifsc: values['bank_ifsc'] || null,
      upi_id: values['upi_id'] || null,
      status: values['status'] || 'Active',
    };
    try {
      if (editId && editVersion !== null) {
        await api.patch(`/vendors/${editId}`, payload, editVersion);
      } else {
        await api.post('/vendors', { client_id: uuidv7(), ...payload });
      }
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['vendors'] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Vendors</h1>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={openCreate}
        >
          Add Vendor
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" title={editId ? 'Edit Vendor' : 'New Vendor'}>
          <FormRenderer
            key={editId ?? 'new'}
            schema={vendorFormSchema}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={saving}
            error={formError}
          />
        </DialogContent>
      </Dialog>

      <div className="flex gap-3">
        <div className="relative w-full md:w-72">
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
            Failed to load vendors
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Truck className="h-10 w-10 opacity-30" />
            <p className="font-medium">No vendors yet</p>
            <p className="text-sm">Add a vendor to record purchases</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Code</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">GSTIN</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground hidden md:table-cell">
                  Status
                </th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">
                    {v.name}
                    <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                      {v.gstin ?? v.vendor_code}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{v.phone ?? '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground hidden md:table-cell">
                    {v.vendor_code}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs hidden md:table-cell">{v.gstin ?? '—'}</td>
                  <td className="px-4 py-2.5 text-center hidden md:table-cell">
                    <StatusBadge status={v.status.toLowerCase()} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(v.id)}>
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
