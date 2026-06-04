export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'gstin'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'percent'
  | 'select'
  | 'switch'
  | 'lookup_endpoint';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  default?: string | number | boolean;
  options?: FieldOption[];
  /** For type 'lookup_endpoint' — fetched as {value,label} via these fields. */
  optionsEndpoint?: string;
  optionsValueField?: string;
  optionsLabelField?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  width?: 'full' | 'half' | 'third';
  /** depends_on: show this field only when the expression is truthy, e.g. "${is_batched} == true". */
  visibleWhen?: string;
  /** computed display field: a formula over other fields, e.g. "${sale_price} - ${purchase_price}". Rendered read-only and NOT submitted. */
  computed?: string;
  computedFormat?: 'currency' | 'percent' | 'number';
}

export interface SectionDef {
  id: string;
  title?: string;
  columns?: 1 | 2 | 3;
  fields: FieldDef[];
}

export interface FormSchema {
  formId: string;
  title: string;
  entity: string;
  submitLabel?: string;
  sections: SectionDef[];
}

export type FormValues = Record<string, string | number | boolean | null | undefined>;
