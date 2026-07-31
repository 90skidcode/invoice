import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react';
import * as React from 'react';

export interface LeadTag {
  id: string;
  name: string;
  color: string;
}

export interface SelectedTag {
  id?: string;
  name: string;
}

export function TagPicker({
  selectedTags,
  onChange,
}: Readonly<{
  selectedTags: SelectedTag[];
  onChange: (tags: SelectedTag[]) => void;
}>) {
  const { data: allTags } = useQuery<LeadTag[]>({
    queryKey: ['lead-tags'],
    queryFn: () => api.get<LeadTag[]>('/leads/tags'),
  });
  const [tagInput, setTagInput] = React.useState('');

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
    onChange([...selectedTags, existing ? { id: existing.id, name: existing.name } : { name: trimmed }]);
    setTagInput('');
  }

  function removeTag(name: string) {
    onChange(selectedTags.filter((t) => t.name !== name));
  }

  return (
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
  );
}
