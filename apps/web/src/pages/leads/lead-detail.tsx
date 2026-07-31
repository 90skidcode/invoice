import { FormRenderer } from '@/components/forms/form-renderer';
import type { FormValues } from '@/components/forms/types';
import { LogFollowUpDialog } from '@/components/log-followup-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateTimeDisplay, PriceDisplay } from '@/components/ui/price-display';
import { leadFormSchema } from '@/forms/lead.form';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Edit, Phone, UserCheck } from 'lucide-react';
import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { uuidv7 } from 'uuidv7';

interface LeadActivity {
  id: string;
  type: string;
  note: string | null;
  status_at_time: string | null;
  next_follow_up_at: string | null;
  created_at: string;
}

interface LeadTag {
  id: string;
  name: string;
  color: string;
}

interface LeadDetailData {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company_name: string | null;
  source_id: string | null;
  status: string;
  assigned_to: string | null;
  expected_value: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  referred_by_customer_id: string | null;
  customer_id: string | null;
  converted_at: string | null;
  row_version: number;
  activities: LeadActivity[];
  tags: LeadTag[];
}

function ConvertLeadDialog({
  lead,
  onClose,
  onConverted,
}: Readonly<{
  lead: LeadDetailData;
  onClose: () => void;
  onConverted: (customerId: string) => void;
}>) {
  const [gstin, setGstin] = React.useState('');
  const [creditLimit, setCreditLimit] = React.useState('0.00');
  const [creditDays, setCreditDays] = React.useState('0');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleConvert() {
    setError(null);
    setSaving(true);
    try {
      const result = await api.post<{ lead_id: string; customer: { id: string } }>(
        `/leads/${lead.id}/convert`,
        {
          client_id: uuidv7(),
          gstin: gstin || null,
          credit_limit: creditLimit || '0.00',
          credit_days: Number(creditDays || 0),
        },
      );
      onConverted(result.customer.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert lead');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="sm" title="Convert to Customer">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-medium">{lead.name}</p>
            <p className="text-muted-foreground">{lead.phone}</p>
            {lead.email && <p className="text-muted-foreground">{lead.email}</p>}
          </div>

          <label htmlFor="convert-gstin" className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              GSTIN (optional)
            </span>
            <Input id="convert-gstin" value={gstin} onChange={(e) => setGstin(e.target.value)} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="convert-credit-limit" className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Credit Limit
              </span>
              <Input
                id="convert-credit-limit"
                type="number"
                prefix="₹"
                step="0.01"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </label>
            <label htmlFor="convert-credit-days" className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Credit Days
              </span>
              <Input
                id="convert-credit-days"
                type="number"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
              />
            </label>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              iconLeft={saving ? undefined : <Check className="h-4 w-4" />}
              onClick={handleConvert}
            >
              Convert
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [editSaving, setEditSaving] = React.useState(false);
  const [followUpOpen, setFollowUpOpen] = React.useState(false);
  const [convertOpen, setConvertOpen] = React.useState(false);

  const { data: lead, isLoading, error, refetch } = useQuery<LeadDetailData>({
    queryKey: ['lead', id],
    queryFn: () => api.get<LeadDetailData>(`/leads/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-muted-foreground">Loading…</div>;
  }

  if (error || !lead) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24">
        <p className="text-destructive">Failed to load lead.</p>
        <Button variant="outline" onClick={() => navigate('/leads')}>
          Back to Leads
        </Button>
      </div>
    );
  }

  const currentLead = lead;

  async function handleEditSubmit(values: FormValues) {
    setEditError(null);
    setEditSaving(true);
    const payload = {
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
    };
    try {
      await api.patch(`/leads/${currentLead.id}`, payload, currentLead.row_version);
      setEditOpen(false);
      await refetch();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update lead');
    } finally {
      setEditSaving(false);
    }
  }

  const isConverted = !!lead.customer_id;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-12">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/leads')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Leads
        </button>
        <div className="flex items-center gap-2">
          {!isConverted && (
            <Button variant="outline" size="sm" iconLeft={<Phone className="h-4 w-4" />} onClick={() => setFollowUpOpen(true)}>
              Log Follow-up
            </Button>
          )}
          {!isConverted && (
            <Button variant="outline" size="sm" iconLeft={<Edit className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          )}
          {!isConverted && (
            <Button variant="primary" size="sm" iconLeft={<UserCheck className="h-4 w-4" />} onClick={() => setConvertOpen(true)}>
              Convert to Customer
            </Button>
          )}
          {isConverted && (
            <Button variant="outline" size="sm" onClick={() => navigate(`/customers`)}>
              View Customer
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{lead.name}</h1>
            {lead.company_name && <p className="text-sm text-muted-foreground">{lead.company_name}</p>}
          </div>
          <StatusBadge status={lead.status} className="text-sm px-3 py-1" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="mt-0.5 text-sm font-medium tabular-nums">{lead.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="mt-0.5 text-sm font-medium">{lead.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Expected Value</p>
            <p className="mt-0.5 text-sm font-medium">
              {lead.expected_value ? <PriceDisplay value={lead.expected_value} /> : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Next Follow-up</p>
            <p className="mt-0.5 text-sm font-medium">
              <DateTimeDisplay value={lead.next_follow_up_at} />
            </p>
          </div>
        </div>

        {lead.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {lead.tags.map((t) => (
              <span key={t.id} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.color}`}>
                {t.name}
              </span>
            ))}
          </div>
        )}

        {lead.notes && (
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
            {lead.notes}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Activity Timeline</h2>
        {lead.activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity logged yet.</p>
        ) : (
          <div className="space-y-3">
            {lead.activities.map((a) => (
              <div key={a.id} className="border-l-2 border-border pl-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <DateTimeDisplay value={a.created_at} />
                  {a.status_at_time && <StatusBadge status={a.status_at_time} className="text-[10px]" />}
                </div>
                {a.note && <p className="mt-1 text-sm">{a.note}</p>}
                {a.next_follow_up_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Next follow-up scheduled: <DateTimeDisplay value={a.next_follow_up_at} />
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent size="lg" title="Edit Lead">
          <FormRenderer
            schema={leadFormSchema}
            initialValues={{
              name: lead.name,
              phone: lead.phone,
              email: lead.email ?? '',
              company_name: lead.company_name ?? '',
              source_id: lead.source_id ?? '',
              status: lead.status,
              assigned_to: lead.assigned_to ?? '',
              expected_value: lead.expected_value ?? '',
              referred_by_customer_id: lead.referred_by_customer_id ?? '',
              notes: lead.notes ?? '',
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditOpen(false)}
            submitting={editSaving}
            error={editError}
          />
        </DialogContent>
      </Dialog>

      {followUpOpen && (
        <LogFollowUpDialog
          leadId={lead.id}
          currentStatus={lead.status}
          onClose={() => setFollowUpOpen(false)}
          onLogged={() => {
            refetch();
            queryClient.invalidateQueries({ queryKey: ['leads-dashboard'] });
          }}
        />
      )}

      {convertOpen && (
        <ConvertLeadDialog
          lead={lead}
          onClose={() => setConvertOpen(false)}
          onConverted={() => {
            setConvertOpen(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['leads-dashboard'] });
          }}
        />
      )}
    </div>
  );
}
