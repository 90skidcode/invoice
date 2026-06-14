import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type * as React from 'react';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const sizeMap = {
  sm: 'md:max-w-md',
  md: 'md:max-w-xl',
  lg: 'md:max-w-3xl',
  xl: 'md:max-w-5xl',
} as const;

function DialogContent({
  className,
  children,
  size = 'md',
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
      {/* Overlay — fades in */}
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 animate-fade-in" />

      <DialogPrimitive.Content
        className={cn(
          // Base
          'fixed z-50 grid gap-4 bg-background shadow-lg overflow-y-auto focus:outline-none',
          // ── Mobile: bottom sheet ──────────────────────────────────
          'bottom-0 left-0 right-0 w-full rounded-t-2xl border-t border-border',
          'max-h-[92vh] px-5 pb-8 pt-3',
          'animate-slide-up',
          // ── Desktop: centered modal ───────────────────────────────
          'md:animate-none',
          'md:bottom-auto md:left-1/2 md:top-1/2 md:right-auto',
          'md:-translate-x-1/2 md:-translate-y-1/2',
          'md:rounded-lg md:border md:max-h-[90vh] md:p-6',
          sizeMap[size],
          className,
        )}
      >
        {/* Drag handle — visible on mobile only */}
        <div className="flex justify-center md:hidden -mt-1 mb-1" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {title && (
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
        )}

        {children}

        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent };
