import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, LockOpen, Plus, Users } from 'lucide-react';
import * as React from 'react';

type Tab = 'org' | 'tax' | 'series' | 'locks' | 'team';
const TABS: { id: Tab; label: string }[] = [
  { id: 'org', label: 'Organization' },
  { id: 'tax', label: 'Tax Rates' },
  { id: 'series', label: 'Invoice Series' },
  { id: 'locks', label: 'Period Locks' },
  { id: 'team', label: 'Team Members' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function OrgTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({
    queryKey: ['settings-org'],
    queryFn: () => api.get('/settings'),
  });
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data) {
      const settings = (data['settings'] as Record<string, unknown> | undefined) || {};
      setForm({
        name: data['name'] ?? '',
        gstin: data['gstin'] ?? '',
        address: data['address'] ?? '',
        phone: data['phone'] ?? '',
        email: data['email'] ?? '',
        upi_id: data['upi_id'] ?? '',
        logo_url: data['logo_url'] ?? '',
        instagram: (settings['instagram'] as string | undefined) ?? '',
      });
    }
  }, [data]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        name: form['name'],
        gstin: form['gstin'],
        address: form['address'],
        phone: form['phone'],
        email: form['email'],
        upi_id: form['upi_id'],
        logo_url: form['logo_url'] || null,
        settings: {
          ...((data && (data['settings'] as Record<string, unknown> | undefined)) || {}),
          instagram: form['instagram'] || '',
        },
      };
      await api.patch('/settings', payload);
      setMsg('Saved');
      await qc.invalidateQueries({ queryKey: ['settings-org'] });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  const fields: [string, string][] = [
    ['name', 'Name'],
    ['logo_url', 'Logo URL (optional)'],
    ['phone', 'Phone (Whats/call)'],
    ['email', 'Email'],
    ['instagram', 'Instagram Handle'],
    ['address', 'Address'],
    ['upi_id', 'UPI ID'],
    ['gstin', 'GSTIN'],
  ];

  return (
    <div className="max-w-xl space-y-3">
      {fields.map(([k, label]) => (
        <label key={k} className="block">
          <span className="mb-1 block text-sm font-medium">{label}</span>
          <Input
            value={form[k] ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))}
          />
        </label>
      ))}
      {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
      <Button variant="primary" loading={saving} onClick={save}>
        Save
      </Button>
    </div>
  );
}

interface TaxRate {
  id: string;
  name: string;
  total_rate: string;
  cgst_rate: string;
  sgst_rate: string;
  igst_rate: string;
}
function TaxTab() {
  const qc = useQueryClient();
  const { data } = useQuery<TaxRate[]>({
    queryKey: ['tax-rates'],
    queryFn: () => api.get('/tax-rates'),
  });
  const [name, setName] = React.useState('');
  const [rate, setRate] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function add() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/tax-rates', { name, total_rate: rate, effective_from: today() });
      setName('');
      setRate('');
      await qc.invalidateQueries({ queryKey: ['tax-rates'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="GST 12%" />
        </label>
        <label className="block w-28">
          <span className="mb-1 block text-xs text-muted-foreground">Total %</span>
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <Button
          variant="primary"
          loading={saving}
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={add}
          disabled={!name || !rate}
        >
          Add
        </Button>
      </div>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">CGST</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">SGST</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">IGST</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{t.name}</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.total_rate}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.cgst_rate}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.sgst_rate}%</td>
                <td className="px-4 py-2 text-right tabular-nums">{t.igst_rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface Series {
  id: string;
  name: string;
  document_type: string;
  prefix: string | null;
  suffix: string | null;
  next_number: number;
  is_default: boolean;
  is_active: boolean;
}
function SeriesTab() {
  const qc = useQueryClient();
  const { data } = useQuery<Series[]>({
    queryKey: ['invoice-series'],
    queryFn: () => api.get('/invoice-series'),
  });
  const [name, setName] = React.useState('');
  const [prefix, setPrefix] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function add() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/invoice-series', {
        name,
        document_type: 'invoice',
        prefix,
        number_padding: 4,
        starting_number: 1,
      });
      setName('');
      setPrefix('');
      await qc.invalidateQueries({ queryKey: ['invoice-series'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Estimate" />
        </label>
        <label className="block w-32">
          <span className="mb-1 block text-xs text-muted-foreground">Prefix</span>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="EST-" />
        </label>
        <Button
          variant="primary"
          loading={saving}
          iconLeft={<Plus className="h-4 w-4" />}
          onClick={add}
          disabled={!name}
        >
          Add
        </Button>
      </div>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Prefix</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Next #</th>
              <th className="px-4 py-2 text-center font-medium text-muted-foreground">Default</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className="px-4 py-2 text-xs">{s.document_type}</td>
                <td className="px-4 py-2 font-mono text-xs">{s.prefix ?? '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.next_number}</td>
                <td className="px-4 py-2 text-center">{s.is_default ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PeriodLock {
  id: string;
  lock_through_date: string;
  reason: string | null;
  unlocked_at: string | null;
}
function LocksTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<PeriodLock[]>({
    queryKey: ['period-locks'],
    queryFn: () => api.get('/settings/period-locks'),
  });
  const [lockDate, setLockDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function lock() {
    setErr(null);
    setSaving(true);
    try {
      await api.post('/settings/period-lock', { lock_through_date: lockDate, reason });
      setLockDate('');
      setReason('');
      await qc.invalidateQueries({ queryKey: ['period-locks'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }
  async function unlock(id: string) {
    const r = window.prompt('Reason for unlocking?');
    if (!r) return;
    try {
      await api.post('/settings/period-unlock', { lock_id: id, reason: r });
      await qc.invalidateQueries({ queryKey: ['period-locks'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 max-w-lg">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <Lock className="h-4 w-4" /> Close a period
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          No transactions dated on or before the lock date can be created or edited.
        </p>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Lock through</span>
            <Input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Reason</span>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Annual audit"
            />
          </label>
          <Button variant="primary" loading={saving} onClick={lock} disabled={!lockDate}>
            Lock
          </Button>
        </div>
        {err && <div className="mt-2 text-sm text-destructive">{err}</div>}
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">
                  Locked Through
                </th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Reason</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No period locks.
                  </td>
                </tr>
              ) : (
                (data ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 tabular-nums">{l.lock_through_date}</td>
                    <td className="px-4 py-2 text-muted-foreground">{l.reason ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={l.unlocked_at ? 'inactive' : 'active'} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!l.unlocked_at && (
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<LockOpen className="h-3.5 w-3.5" />}
                          onClick={() => unlock(l.id)}
                        >
                          Unlock
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface UserRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  default_branch_id: string;
  row_version: number;
}

function UsersTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const branches = user?.branches ?? [];

  const { data: team, isLoading } = useQuery<UserRow[]>({
    queryKey: ['settings-users'],
    queryFn: () => api.get<UserRow[]>('/users'),
  });

  const [formOpen, setFormOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editVersion, setEditVersion] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Fields state
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('cashier');
  const [pin, setPin] = React.useState('');
  const [status, setStatus] = React.useState('Active');
  const [defaultBranchId, setDefaultBranchId] = React.useState('');

  React.useEffect(() => {
    const firstBranch = branches[0];
    if (branches.length > 0 && !defaultBranchId && firstBranch) {
      setDefaultBranchId(firstBranch.id);
    }
  }, [branches, defaultBranchId]);

  function openAdd() {
    setEditId(null);
    setEditVersion(null);
    setName('');
    setPhone('');
    setEmail('');
    setRole('cashier');
    setPin('');
    setStatus('Active');
    const firstBranch = branches[0];
    if (branches.length > 0 && firstBranch) setDefaultBranchId(firstBranch.id);
    setErr(null);
    setFormOpen(true);
  }

  function openEdit(member: UserRow) {
    setEditId(member.id);
    setEditVersion(member.row_version);
    setName(member.name);
    setPhone(member.phone);
    setEmail(member.email ?? '');
    setRole(member.role);
    setPin(''); // Leave blank to not change PIN
    setStatus(member.status);
    setDefaultBranchId(member.default_branch_id);
    setErr(null);
    setFormOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      if (editId) {
        // Edit User
        const payload: any = {
          name,
          phone,
          email: email || null,
          role,
          status,
          default_branch_id: defaultBranchId,
        };
        if (pin) {
          if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
            throw new Error('PIN must be exactly 4 digits');
          }
          payload.pin = pin;
        }
        await api.patch(`/users/${editId}`, payload, editVersion!);
      } else {
        // Create User
        if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
          throw new Error('PIN must be exactly 4 digits');
        }
        const payload = {
          name,
          phone,
          email: email || null,
          role,
          pin,
          default_branch_id: defaultBranchId,
        };
        await api.post('/users', payload);
      }
      setFormOpen(false);
      await qc.invalidateQueries({ queryKey: ['settings-users'] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Are you sure you want to remove this team member?')) return;
    try {
      await api.delete(`/users/${id}`);
      await qc.invalidateQueries({ queryKey: ['settings-users'] });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete user');
    }
  }

  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    cashier: 'Cashier / Billing Agent',
    stock: 'Stock Manager',
    accountant: 'Accountant',
    mechanic: 'Mechanic / Technician',
    viewer: 'Viewer / Auditor',
    owner: 'Owner',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs text-muted-foreground">
            Manage organization users, roles, and login access PIN codes.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus className="h-4 w-4" />} onClick={openAdd}>
          Add Team Member
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-auto bg-card">
        {isLoading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-4 w-4 animate-spin inline" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-2 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(team ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    No team members registered.
                  </td>
                </tr>
              ) : (
                (team ?? []).map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors"
                  >
                    <td className="px-4 py-2 font-medium">{m.name}</td>
                    <td className="px-4 py-2 font-mono text-xs">{m.phone}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{m.email ?? '—'}</td>
                    <td className="px-4 py-2 text-xs font-semibold capitalize">
                      {roleLabels[m.role] ?? m.role}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={m.status.toLowerCase()} />
                    </td>
                    <td className="px-4 py-2 text-right space-x-1.5">
                      {m.role !== 'owner' && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => remove(m.id)}
                          >
                            Remove
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent
          size="md"
          title={editId ? 'Edit Team Member' : 'Add New Team Member'}
          description="Create or modify user profiles and assign store permissions."
        >
          <form onSubmit={submit} className="space-y-4">
            {err && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                {err}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. Deepika Rajadurai"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Phone (Login ID) <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g. 9876543210"
                  maxLength={15}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Email (Optional)
                </label>
                <Input
                  type="email"
                  placeholder="name@store.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Role <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-background border border-input rounded-md px-3 h-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  >
                    <option value="cashier">Cashier</option>
                    <option value="admin">Administrator</option>
                    <option value="stock">Stock Manager</option>
                    <option value="accountant">Accountant</option>
                    <option value="mechanic">Mechanic</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Status <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-background border border-input rounded-md px-3 h-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Default Branch <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={defaultBranchId}
                    onChange={(e) => setDefaultBranchId(e.target.value)}
                    className="w-full bg-background border border-input rounded-md px-3 h-10 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    required
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    {editId ? 'Reset 4-Digit PIN (Optional)' : '4-Digit Login PIN'}{' '}
                    <span className="text-destructive">{!editId && '*'}</span>
                  </label>
                  <Input
                    type="password"
                    placeholder={editId ? 'Leave blank to keep current' : '4-digit PIN'}
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    required={!editId}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editId ? 'Save Changes' : 'Create Member'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = React.useState<Tab>('org');

  const visibleTabs = React.useMemo(() => {
    const list = [...TABS];
    const canManageTeam =
      user?.role === 'owner' || user?.role === 'admin' || user?.role === 'super_admin';
    if (!canManageTeam) {
      return list.filter((t) => t.id !== 'team');
    }
    return list;
  }, [user]);

  React.useEffect(() => {
    const firstTab = visibleTabs[0];
    if (!visibleTabs.some((t) => t.id === tab) && firstTab) {
      setTab(firstTab.id);
    }
  }, [visibleTabs, tab]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <div className="flex gap-1 border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'org' && <OrgTab />}
      {tab === 'tax' && <TaxTab />}
      {tab === 'series' && <SeriesTab />}
      {tab === 'locks' && <LocksTab />}
      {tab === 'team' && <UsersTab />}
    </div>
  );
}
