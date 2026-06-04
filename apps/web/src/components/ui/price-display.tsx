import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/utils';
import * as React from 'react';

interface PriceDisplayProps {
  value: string | number | null | undefined;
  currency?: string;
  className?: string;
  negative?: boolean;
}

export function PriceDisplay({ value, currency = '₹', className, negative }: PriceDisplayProps) {
  const formatted = formatMoney(value, currency);
  return (
    <span className={cn('price tabular-nums', negative && 'text-destructive', className)}>
      {formatted}
    </span>
  );
}

interface DateDisplayProps {
  value: string | null | undefined;
  className?: string;
}

export function DateDisplay({ value, className }: DateDisplayProps) {
  if (!value) return <span className={cn('text-muted-foreground', className)}>—</span>;
  const parts = value.split('-');
  if (parts.length === 3) {
    return (
      <span className={cn('tabular-nums', className)}>
        {parts[2]}-{parts[1]}-{parts[0]}
      </span>
    );
  }
  return <span className={className}>{value}</span>;
}

interface QuantityDisplayProps {
  value: string | number | null | undefined;
  unit?: string;
  className?: string;
}

export function QuantityDisplay({ value, unit, className }: QuantityDisplayProps) {
  if (value === null || value === undefined || value === '') {
    return <span className={cn('tabular-nums text-muted-foreground', className)}>—</span>;
  }
  const num = Number(value)
    .toFixed(3)
    .replace(/\.?0+$/, '');
  return (
    <span className={cn('tabular-nums', className)}>
      {num}
      {unit && <span className="ml-1 text-muted-foreground text-xs">{unit}</span>}
    </span>
  );
}
