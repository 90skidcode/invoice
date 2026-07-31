import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { TagPicker, type SelectedTag } from '@/components/tag-picker';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

interface LeadStatusOption {
  id: string;
  name: string;
  slug: string;
}

export function LogFollowUpDialog({
  leadId,
  currentStatus,
  onClose,
  onLogged,
}: Readonly<{
  leadId: string;
  currentStatus: string;
  onClose: () => void;
  onLogged: () => void;
}>) {
  const queryClient = useQueryClient();
  const { data: statuses } = useQuery<LeadStatusOption[]>({
    queryKey: ['lead-statuses'],
    queryFn: () => api.get<LeadStatusOption[]>('/lead-statuses'),
  });
  const selectableStatuses = (statuses ?? []).filter((s) => s.slug !== 'converted');

  const [nextFollowUp, setNextFollowUp] = React.useState('');
  const [status, setStatus] = React.useState(currentStatus);
  const [note, setNote] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<SelectedTag[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (selectableStatuses.length === 0) return;
    if (!selectableStatuses.some((s) => s.slug === status)) {
      setStatus(selectableStatuses[0]!.slug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses]);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await api.post(`/leads/${leadId}/log-followup`, {
        next_follow_up_at: nextFollowUp || null,
        status,
        note: note.trim() || null,
        tag_ids: selectedTags.filter((t) => t.id).map((t) => t.id),
        new_tag_names: selectedTags.filter((t) => !t.id).map((t) => t.name),
      });
      await queryClient.invalidateQueries({ queryKey: ['lead-tags'] });
      onLogged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log follow-up');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="sm" title="Log Follow-up">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next Follow-up
              </span>
              <DateTimePicker value={nextFollowUp} onChange={setNextFollowUp} placeholder="Pick date & time" />
            </div>
            <label htmlFor="followup-status" className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </span>
              <select
                id="followup-status"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {selectableStatuses.map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label htmlFor="followup-note" className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Notes
            </span>
            <textarea
              id="followup-note"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="What happened on this call/visit?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <TagPicker selectedTags={selectedTags} onChange={setSelectedTags} />

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              Save Follow-up
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
