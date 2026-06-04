import { cn } from '@/lib/utils';
import * as React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  error?: boolean;
  selectOnFocus?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, prefix, suffix, error, selectOnFocus, onFocus, ...props }, ref) => {
    const handleFocus = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        if (selectOnFocus) e.target.select();
        onFocus?.(e);
      },
      [selectOnFocus, onFocus],
    );

    if (prefix || suffix) {
      return (
        <div
          className={cn(
            'flex h-9 items-center rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
            error && 'border-destructive focus-within:ring-destructive',
            className,
          )}
        >
          {prefix && (
            <span className="flex items-center pl-3 text-sm text-muted-foreground">{prefix}</span>
          )}
          <input
            type={type}
            className="flex-1 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            ref={ref}
            aria-invalid={error}
            onFocus={handleFocus}
            {...props}
          />
          {suffix && (
            <span className="flex items-center pr-3 text-sm text-muted-foreground">{suffix}</span>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-destructive focus-visible:ring-destructive',
          className,
        )}
        ref={ref}
        aria-invalid={error}
        onFocus={handleFocus}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
