import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';

type Tab = 'org' | 'tax' | 'series' | 'locks';
const TABS: { id: Tab; label: string }[] = [
  { id: 'org', label: 'Organization' },
  { id: 'tax', label: 'Tax Rates' },
  { id: 'series', label: 'Invoice Series' },
  { id: 'locks', label: 'Period Locks' },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function OrgTab() {
  const qc = useQueryClient();
  const { data } = useQuery<Record<string, string>>({ queryKey: ['settings-org'], queryFn: () => api.get('/settings') });
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (data) setForm({ name: data['name'] ?? '', gstin: data['gstin'] ?? '', address: data['address'] ?? '', phone: data['phone'] ?? '', email: data['email'] ?? '', upi_id: data['upi_id'] ?? '' });
  }, [data]);
  async function save() {
    setSaving(true); setMsg(null);
    try { await api.patch('/settings', form); setMsg('Saved'); await qc.invalidateQueries({ queryKey: ['settings-org'] }); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  const fields: [string, string][] = [['name', 'Name'], ['gstin', 'GSTIN'], ['phone', 'Phone'], ['email', 'Email'], ['upi_id', 'UPI ID'], ['address', 'Address']];
  return (
    <div className="max-w-xl space-y-3">
      {fields.map(([k, label]) => (
        <label key={k} className="block">
          <span className="mb-1 block text-sm font-medium">{label}</span>
          <Input value={form[k] ?? ''} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
        </label>
      ))}
      {msg && <div className="text-sm text-muted-foreground">{msg}</div>}
      <Button variant="primary" loading={saving} onClick={save}>Save</Button>
    </div>
  );
}

interface TaxRate { id: string; name: string; total_rate: string; cgst_rate: string; sgst_rate: string; igst_rate: string; }
function TaxTab() {
  const qc = useQueryClient();
  const { data } = useQuery<TaxRate[]>({ queryKey: ['tax-rates'], queryFn: () => api.get('/tax-rates') });
  const [name, setName] = React.useState('');
  const [rate, setRate] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function add() {
    setErr(null); setSaving(true);
    try {
      await api.post('/tax-rates', { name, total_rate: rate, effective_from: today() });
      setName(''); setRate(''); await qc.invalidateQueries({ queryKey: ['tax-rates'] });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="GST 12%" /></label>
        <label className="block w-28"><span className="mb-1 block text-xs text-muted-foreground">Total %</span><Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} /></label>
        <Button variant="primary" loading={saving} iconLeft={<Plus className="h-4 w-4" />} onClick={add} disabled={!name || !rate}>Add</Button>
      </div>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">CGST</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">SGST</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">IGST</th>
          </tr></thead>
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

interface Series { id: string; name: string; document_type: string; prefix: string | null; suffix: string | null; next_number: number; is_default: boolean; is_active: boolean; }
function SeriesTab() {
  const qc = useQueryClient();
  const { data } = useQuery<Series[]>({ queryKey: ['invoice-series'], queryFn: () => api.get('/invoice-series') });
  const [name, setName] = React.useState('');
  const [prefix, setPrefix] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function add() {
    setErr(null); setSaving(true);
    try {
      await api.post('/invoice-series', { name, document_type: 'invoice', prefix, number_padding: 4, starting_number: 1 });
      setName(''); setPrefix(''); await qc.invalidateQueries({ queryKey: ['invoice-series'] });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Estimate" /></label>
        <label className="block w-32"><span className="mb-1 block text-xs text-muted-foreground">Prefix</span><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="EST-" /></label>
        <Button variant="primary" loading={saving} iconLeft={<Plus className="h-4 w-4" />} onClick={add} disabled={!name}>Add</Button>
      </div>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Type</th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Prefix</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Next #</th>
            <th className="px-4 py-2 text-center font-medium text-muted-foreground">Default</th>
          </tr></thead>
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

interface PeriodLock { id: string; lock_through_date: string; reason: string | null; unlocked_at: string | null; }
function LocksTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<PeriodLock[]>({ queryKey: ['period-locks'], queryFn: () => api.get('/settings/period-locks') });
  const [lockDate, setLockDate] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function lock() {
    setErr(null); setSaving(true);
    try { await api.post('/settings/period-lock', { lock_through_date: lockDate, reason }); setLockDate(''); setReason(''); await qc.invalidateQueries({ queryKey: ['period-locks'] }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
    finally { setSaving(false); }
  }
  async function unlock(id: string) {
    const r = window.prompt('Reason for unlocking?');
    if (!r) return;
    try { await api.post('/settings/period-unlock', { lock_id: id, reason: r }); await qc.invalidateQueries({ queryKey: ['period-locks'] }); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 max-w-lg">
        <p className="text-sm font-medium mb-2 flex items-center gap-2"><Lock className="h-4 w-4" /> Close a period</p>
        <p className="text-xs text-muted-foreground mb-3">No transactions dated on or before the lock date can be created or edited.</p>
        <div className="flex items-end gap-2">
          <label className="block"><span className="mb-1 block text-xs text-muted-foreground">Lock through</span><Input type="date" value={lockDate} onChange={(e) => setLockDate(e.target.value)} /></label>
          <label className="block flex-1"><span className="mb-1 block text-xs text-muted-foreground">Reason</span><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Annual audit" /></label>
          <Button variant="primary" loading={saving} onClick={lock} disabled={!lockDate}>Lock</Button>
        </div>
        {err && <div className="mt-2 text-sm text-destructive">{err}</div>}
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? <div className="py-8 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Locked Through</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Reason</th>
              <th className="px-4 py-2 text-center font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-2" />
            </tr></thead>
            <tbody>
              {(data ?? []).length === 0 ? (
                <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No period locks.</td></tr>
              ) : (data ?? []).map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 tabular-nums">{l.lock_through_date}</td>
                  <td className="px-4 py-2 text-muted-foreground">{l.reason ?? '—'}</td>
                  <td className="px-4 py-2 text-center"><StatusBadge status={l.unlocked_at ? 'inactive' : 'active'} /></td>
                  <td className="px-4 py-2 text-right">
                    {!l.unlocked_at && (
                      <Button variant="ghost" size="sm" iconLeft={<LockOpen className="h-3.5 w-3.5" />} onClick={() => unlock(l.id)}>Unlock</Button>
                    )}
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

export function SettingsPage() {
  const [tab, setTab] = React.useState<Tab>('org');
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'org' && <OrgTab />}
      {tab === 'tax' && <TaxTab />}
      {tab === 'series' && <SeriesTab />}
      {tab === 'locks' && <LocksTab />}
    </div>
  );
}
