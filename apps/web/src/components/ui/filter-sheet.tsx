import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Filter, X } from 'lucide-react';
import type * as React from 'react';

export function FilterTrigger({
  active,
  onOpen,
  onClear,
}: Readonly<{
  active: boolean;
  onOpen: () => void;
  onClear: () => void;
}>) {
  return (
    <>
      <Button
        variant={active ? 'secondary' : 'outline'}
        iconLeft={<Filter className="h-4 w-4" />}
        onClick={onOpen}
      >
        Filter
      </Button>
      {active && (
        <Button variant="ghost" iconLeft={<X className="h-4 w-4" />} onClick={onClear}>
          Clear
        </Button>
      )}
    </>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  title = 'Advanced Filters',
  description,
  hasActiveFilters,
  onClear,
  children,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  hasActiveFilters: boolean;
  onClear: () => void;
  children: React.ReactNode;
}>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="sm" title={title} {...(description ? { description } : {})}>
        <div className="space-y-5">
          {children}

          <div className="flex justify-end gap-2 pt-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" iconLeft={<X className="h-4 w-4" />} onClick={onClear}>
                Clear
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
