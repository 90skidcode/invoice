import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export type StatusKey =
  | 'paid'
  | 'unpaid'
  | 'partial'
  | 'posted'
  | 'voided'
  | 'draft'
  | 'active'
  | 'inactive'
  | 'blocked'
  | 'completed'
  | 'pending'
  | 'cancelled'
  | 'in_progress'
  | 'overdue';

const statusVariantMap: Record<StatusKey, VariantProps<typeof badgeVariants>['variant']> = {
  paid: 'success',
  active: 'success',
  completed: 'success',
  posted: 'default',
  in_progress: 'warning',
  partial: 'warning',
  pending: 'warning',
  unpaid: 'destructive',
  overdue: 'destructive',
  blocked: 'destructive',
  voided: 'secondary',
  cancelled: 'secondary',
  inactive: 'secondary',
  draft: 'outline',
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const variant = statusVariantMap[status as StatusKey] ?? 'secondary';
  return (
    <Badge variant={variant} className={cn('capitalize', className)}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

export { Badge, badgeVariants };
