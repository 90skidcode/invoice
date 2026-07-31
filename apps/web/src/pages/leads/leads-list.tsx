import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PriceDisplay, DateTimeDisplay } from '@/components/ui/price-display';
import { LogFollowUpDialog } from '@/components/log-followup-dialog';
import { TagPicker, type SelectedTag } from '@/components/tag-picker';
import { leadFormSchema } from '@/forms/lead.form';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Search, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  company_name: string | null;
  source_id: string | null;
  status: string;
  assigned_to: string | null;
  expected_value: string | null;
  next_follow_up_at: string | null;
}

interface LeadSource {
  id: string;
  name: string;
  badge_color: string;
}

interface LeadStatusOption {
  id: string;
  name: string;
  slug: string;
}

function isOverdue(nextFollowUpAt: string | null): boolean {
  if (!nextFollowUpAt) return false;
  return new Date(nextFollowUpAt).getTime() < Date.now();
}

export function LeadsListTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [followUpLeadId, setFollowUpLeadId] = React.useState<string | null>(null);
  const [selectedTags, setSelectedTags] = React.useState<SelectedTag[]>([]);

  const { data: sources } = useQuery<LeadSource[]>({
    queryKey: ['lead-sources'],
    queryFn: () => api.get<LeadSource[]>('/lead-sources'),
  });
  const sourceMap = new Map((sources ?? []).map((s) => [s.id, s]));

  const { data: statuses } = useQuery<LeadStatusOption[]>({
    queryKey: ['lead-statuses'],
    queryFn: () => api.get<LeadStatusOption[]>('/lead-statuses'),
  });
  const statusFilters = [
    { value: '', label: 'All' },
    ...(statuses ?? []).map((s) => ({ value: s.slug, label: s.name })),
  ];

  const query = new URLSearchParams();
  if (search) query.set('q', search);
  if (statusFilter) query.set('status', statusFilter);

  const { data, isLoading, error } = useQuery<LeadRow[]>({
    queryKey: ['leads', search, statusFilter],
    queryFn: () => api.get<LeadRow[]>(`/leads?${query.toString()}`),
  });
  const leadRows = data ?? [];

  function openCreate() {
    setFormError(null);
    setSelectedTags([]);
    setFormOpen(true);
  }

  async function handleSubmit(values: FormValues) {
    setFormError(null);
    setSaving(true);
    const payload = {
      client_id: uuidv7(),
      name: values['name'],
      phone: values['phone'],
      email: values['email'] || null,
      company_name: values['company_name'] || null,
      source_id: values['source_id'] || null,
      status: values['status'] || 'new',
      assigned_to: values['assigned_to'] || null,
      expected_value: values['expected_value'] ? String(values['expected_value']) : null,
      referred_by_customer_id: values['referred_by_customer_id'] || null,
      notes: values['notes'] || null,
      tag_ids: selectedTags.filter((t) => t.id).map((t) => t.id),
      new_tag_names: selectedTags.filter((t) => !t.id).map((t) => t.name),
    };
    try {
      await api.post('/leads', payload);
      setFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="primary" size="sm" iconLeft={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Add Lead
        </Button>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent size="lg" title="New Lead">
          <div className="mb-4">
            <TagPicker selectedTags={selectedTags} onChange={setSelectedTags} />
          </div>
          <FormRenderer
            schema={leadFormSchema}
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            submitting={saving}
            error={formError}
          />
        </DialogContent>
      </Dialog>

      {followUpLeadId && (
        <LogFollowUpDialog
          leadId={followUpLeadId}
          currentStatus={leadRows.find((l) => l.id === followUpLeadId)?.status ?? 'new'}
          onClose={() => setFollowUpLeadId(null)}
          onLogged={() => queryClient.invalidateQueries({ queryKey: ['leads'] })}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 border border-border overflow-x-auto">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
                statusFilter === f.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive">Failed to load leads</div>
        ) : leadRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <UserPlus className="h-10 w-10 opacity-30" />
            <p className="font-medium">No leads yet</p>
            <p className="text-sm">Add your first lead to start tracking follow-ups</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Source</th>
                <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground hidden md:table-cell">Next Follow-up</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground hidden md:table-cell">Expected Value</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {leadRows.map((l) => {
                const source = l.source_id ? sourceMap.get(l.source_id) : null;
                const overdue = isOverdue(l.next_follow_up_at);
                return (
                  <tr
                    key={l.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/leads/${l.id}`)}
                  >
                    <td className="px-4 py-2.5 font-medium">
                      {l.name}
                      {l.company_name && (
                        <div className="text-xs text-muted-foreground">{l.company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{l.phone}</td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      {source ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${source.badge_color}`}>
                          {source.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <StatusBadge status={l.status} />
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2.5 hidden md:table-cell',
                        overdue ? 'font-semibold text-destructive' : 'text-muted-foreground',
                      )}
                    >
                      {l.next_follow_up_at ? <DateTimeDisplay value={l.next_follow_up_at} /> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">
                      {l.expected_value ? <PriceDisplay value={l.expected_value} /> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Phone className="h-3.5 w-3.5" />}
                        onClick={() => setFollowUpLeadId(l.id)}
                      >
                        Log
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
