import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type * as React from 'react';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

const sizeMap = {
  sm: 'w-1/3 min-w-[320px]',
  lg: 'w-2/3',
} as const;

function SheetContent({
  className,
  children,
  size = 'lg',
  title,
  description,
}: Readonly<{
  className?: string;
  children: React.ReactNode;
  size?: keyof typeof sizeMap;
  title?: string;
  description?: string;
}>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-background shadow-xl',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
          'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
          'duration-200',
          sizeMap[size],
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
          <div className="space-y-0.5">
            {title && (
              <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
            )}
            {description && (
              <DialogPrimitive.Description className="text-xs text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent };
