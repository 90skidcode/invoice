import { cn } from '@/lib/utils';
import * as React from 'react';

export type Tab = 'sales' | 'purchases' | 'manufacturing' | 'gst' | 'stock' | 'receivables';

export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function StatCard({
  label,
  value,
  icon,
  className,
}: Readonly<{
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow duration-200',
        className,
      )}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
        </div>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
    </div>
  );
}

export type PageMeta = { total: number; limit: number; offset: number };

export function ReportPagination({
  page,
  onPageChange,
}: Readonly<{
  page: PageMeta;
  onPageChange: (offset: number) => void;
}>) {
  const totalPages = Math.ceil(page.total / page.limit);
  const currentPage = Math.floor(page.offset / page.limit) + 1;

  if (totalPages <= 1) return null;

  const start = page.offset + 1;
  const end = Math.min(page.offset + page.limit, page.total);

  return (
    <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
      <span>
        {start}–{end} of {page.total.toLocaleString()} records
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(page.offset - page.limit)}
          className={cn(
            'px-2 py-1 rounded border text-xs font-medium transition-colors',
            currentPage === 1
              ? 'opacity-40 cursor-not-allowed border-border bg-muted'
              : 'border-border bg-background hover:bg-muted',
          )}
        >
          ← Prev
        </button>
        <span className="px-2 font-semibold text-foreground">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(page.offset + page.limit)}
          className={cn(
            'px-2 py-1 rounded border text-xs font-medium transition-colors',
            currentPage === totalPages
              ? 'opacity-40 cursor-not-allowed border-border bg-muted'
              : 'border-border bg-background hover:bg-muted',
          )}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

export function SubTabToggle<T extends string>({
  options,
  active,
  onChange,
}: Readonly<{
  options: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}>) {
  return (
    <div className="flex rounded-lg bg-muted p-1 border border-border overflow-x-auto scrollbar-none gap-0 max-w-full">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-semibold transition-all duration-200 whitespace-nowrap shrink-0',
            active === opt.id
              ? 'bg-background text-foreground shadow-sm border border-border/10'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
