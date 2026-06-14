import { cn } from '@/lib/utils';

export type ItemType = 'all' | 'sales' | 'raw';

const OPTIONS: { id: ItemType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sales', label: 'Sales Items' },
  { id: 'raw', label: 'Raw Materials' },
];

export function ItemTypeFilter({
  value,
  onChange,
}: Readonly<{ value: ItemType; onChange: (v: ItemType) => void }>) {
  return (
    <div className="flex gap-1 border-b border-border">
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            value === opt.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ItemTypeBadge({ isFinishedGood }: Readonly<{ isFinishedGood: boolean }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        isFinishedGood ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700',
      )}
    >
      {isFinishedGood ? 'Sales Item' : 'Raw Material'}
    </span>
  );
}

export function filterByItemType<T extends { is_finished_good?: boolean | null }>(
  items: T[],
  type: ItemType,
): T[] {
  if (type === 'sales') return items.filter((i) => i.is_finished_good === true);
  if (type === 'raw') return items.filter((i) => !i.is_finished_good);
  return items;
}
