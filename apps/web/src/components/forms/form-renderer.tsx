import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { cn, formatMoney } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type * as React from 'react';
import { type Control, Controller, useForm, useWatch } from 'react-hook-form';
import { evalBool, evalExpr } from './expr';
import type { FieldDef, FieldOption, FormSchema, FormValues } from './types';

function formatComputed(value: unknown, fmt: FieldDef['computedFormat']): string {
  const n = Number(value ?? 0);
  if (fmt === 'currency') return formatMoney(Number.isNaN(n) ? 0 : n);
  if (fmt === 'percent') return `${(Number.isNaN(n) ? 0 : n).toFixed(2)}%`;
  if (fmt === 'number') return String(Number.isNaN(n) ? 0 : n);
  return String(value ?? '');
}

/** A single field that re-evaluates visibility/computed against live form values. */
function ReactiveField({
  field,
  control,
  children,
}: Readonly<{
  field: FieldDef;
  control: Control<FormValues>;
  children: React.ReactNode;
}>) {
  const values = useWatch({ control }) as FormValues;

  if (field.visibleWhen && !evalBool(field.visibleWhen, values)) return null;

  if (field.computed) {
    const computed = evalExpr(field.computed, values);
    return (
      <div className={cn('block', field.width && widthClass[field.width])}>
        <span className="mb-1 block text-sm font-medium">{field.label}</span>
        <div className="flex h-9 items-center rounded-md border border-dashed border-border bg-muted/30 px-3 text-sm tabular-nums text-muted-foreground">
          {formatComputed(computed, field.computedFormat)}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const widthClass: Record<NonNullable<FieldDef['width']>, string> = {
  full: 'col-span-full',
  half: 'col-span-1',
  third: 'col-span-1',
};

function EndpointSelect({
  field,
  value,
  onChange,
  error,
}: Readonly<{
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}>) {
  const { data, isLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ['form-options', field.optionsEndpoint],
    queryFn: () => api.get<Record<string, unknown>[]>(field.optionsEndpoint!),
    enabled: !!field.optionsEndpoint,
  });

  const options: FieldOption[] = (data ?? []).map((row) => ({
    value: String(row[field.optionsValueField ?? 'id']),
    label: String(row[field.optionsLabelField ?? 'name']),
  }));

  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        error && 'border-destructive',
      )}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{isLoading ? 'Loading…' : `Select ${field.label}…`}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  error = false,
}: Readonly<{
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: boolean;
}>) {
  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          className={cn(
            'min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error && 'border-destructive',
          )}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'switch':
      return (
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          onClick={() => onChange(!value)}
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            value ? 'bg-primary' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              value ? 'translate-x-6' : 'translate-x-1',
            )}
          />
        </button>
      );
    case 'select':
      return (
        <select
          className={cn(
            'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            error && 'border-destructive',
          )}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{`Select ${field.label}…`}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'lookup_endpoint':
      return (
        <EndpointSelect
          field={field}
          value={(value as string) ?? ''}
          onChange={onChange}
          error={error}
        />
      );
    case 'currency':
      return (
        <Input
          type="number"
          step="0.01"
          prefix="₹"
          error={error}
          placeholder={field.placeholder}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'percent':
      return (
        <Input
          type="number"
          step="0.01"
          suffix="%"
          error={error}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          error={error}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    default:
      return (
        <Input
          type={field.type === 'email' ? 'email' : 'text'}
          error={error}
          placeholder={field.placeholder}
          maxLength={field.maxLength}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function FormRenderer({
  schema,
  initialValues,
  onSubmit,
  onCancel,
  submitting,
  error,
}: Readonly<{
  schema: FormSchema;
  initialValues?: FormValues | undefined;
  onSubmit: (values: FormValues) => void | Promise<void>;
  onCancel?: (() => void) | undefined;
  submitting?: boolean | undefined;
  error?: string | null | undefined;
}>) {
  const defaults: FormValues = {};
  for (const section of schema.sections) {
    for (const f of section.fields) {
      if (f.computed) continue; // computed fields are display-only, never submitted
      defaults[f.name] = initialValues?.[f.name] ?? f.default ?? (f.type === 'switch' ? false : '');
    }
  }

  const { control, handleSubmit, formState } = useForm<FormValues>({ defaultValues: defaults });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {schema.sections.map((section) => (
        <div key={section.id} className="space-y-3">
          {section.title && (
            <h3 className="text-sm font-semibold text-muted-foreground">{section.title}</h3>
          )}
          <div
            className={cn(
              'grid gap-3',
              section.columns === 3
                ? 'grid-cols-3'
                : section.columns === 1
                  ? 'grid-cols-1'
                  : 'grid-cols-2',
            )}
          >
            {section.fields.map((field) => (
              <ReactiveField key={field.name} field={field} control={control}>
                <label className={cn('block', field.width && widthClass[field.width])}>
                  <span className="mb-1 block text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive"> *</span>}
                  </span>
                  <Controller
                    name={field.name}
                    control={control}
                    rules={{ required: field.required ? `${field.label} is required` : false }}
                    render={({ field: rhf, fieldState }) => (
                      <FieldControl
                        field={field}
                        value={rhf.value}
                        onChange={rhf.onChange}
                        error={!!fieldState.error}
                      />
                    )}
                  />
                  {field.hint && (
                    <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>
                  )}
                  {formState.errors[field.name] && (
                    <span className="mt-1 block text-xs text-destructive">
                      {String(formState.errors[field.name]?.message)}
                    </span>
                  )}
                </label>
              </ReactiveField>
            ))}
          </div>
        </div>
      ))}

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          loading={!!submitting}
          iconLeft={submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {schema.submitLabel ?? 'Save'}
        </Button>
      </div>
    </form>
  );
}
