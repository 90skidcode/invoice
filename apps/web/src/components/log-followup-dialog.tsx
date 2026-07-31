import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import * as React from 'react';

export interface LeadTag {
  id: string;
  name: string;
  color: string;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'lost', label: 'Lost' },
];

interface SelectedTag {
  id?: string;
  name: string;
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
  const { data: allTags } = useQuery<LeadTag[]>({
    queryKey: ['lead-tags'],
    queryFn: () => api.get<LeadTag[]>('/leads/tags'),
  });

  const [nextFollowUp, setNextFollowUp] = React.useState('');
  const [status, setStatus] = React.useState(
    STATUS_OPTIONS.some((s) => s.value === currentStatus) ? currentStatus : 'contacted',
  );
  const [note, setNote] = React.useState('');
  const [selectedTags, setSelectedTags] = React.useState<SelectedTag[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const suggestions = (allTags ?? []).filter(
    (t) =>
      !selectedTags.some((s) => s.id === t.id) &&
      (tagInput ? t.name.toLowerCase().includes(tagInput.toLowerCase()) : true),
  );

  function addTagByName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      setTagInput('');
      return;
    }
    const existing = (allTags ?? []).find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    setSelectedTags((prev) => [...prev, existing ? { id: existing.id, name: existing.name } : { name: trimmed }]);
    setTagInput('');
  }

  function removeTag(name: string) {
    setSelectedTags((prev) => prev.filter((t) => t.name !== name));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await api.post(`/leads/${leadId}/log-followup`, {
        next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
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
            <label htmlFor="followup-next" className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Next Follow-up
              </span>
              <Input
                id="followup-next"
                type="datetime-local"
                value={nextFollowUp}
                onChange={(e) => setNextFollowUp(e.target.value)}
              />
            </label>
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
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
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

          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tags
            </span>
            {selectedTags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedTags.map((t) => (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                  >
                    {t.name}
                    <button type="button" onClick={() => removeTag(t.name)} aria-label={`Remove ${t.name}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Input
                placeholder="Type to search or create a tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTagByName(tagInput);
                  }
                }}
              />
              {tagInput && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {suggestions.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                      onMouseDown={(e) => { e.preventDefault(); addTagByName(t.name); }}
                    >
                      <Check className="h-3 w-3 text-muted-foreground" /> {t.name}
                    </button>
                  ))}
                  {!suggestions.some((t) => t.name.toLowerCase() === tagInput.trim().toLowerCase()) && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-primary hover:bg-accent"
                      onMouseDown={(e) => { e.preventDefault(); addTagByName(tagInput); }}
                    >
                      <Plus className="h-3 w-3" /> Create "{tagInput.trim()}"
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

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
