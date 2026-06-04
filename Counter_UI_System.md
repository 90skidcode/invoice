# Counter — UI System & Form Builder

**Companion to** `Counter_BRD_FSD.md`, `Counter_FSD_Extended.md`
**Purpose:** Specifies (A) the component library that all screens compose from, and (B) the JSON-driven form builder that renders every data-entry form in the app.

---

# Table of Contents

**Part A — Component Library**
1. Foundations & Principles
2. Design Tokens
3. Component Inventory
4. Primitive Components (spec each)
5. Composite Components
6. Data Display Components
7. Layout Components
8. Feedback Components
9. Navigation Components
10. Accessibility & Keyboard Standards
11. Theming & Customization

**Part B — JSON Form Builder**
12. Why JSON Forms
13. Schema Specification
14. Field Types Catalog
15. Validation System
16. Conditional Logic
17. Computed Fields
18. Layouts (Tabs / Sections / Grids)
19. Field-Level Permissions
20. Custom Fields Integration
21. Localization
22. Versioning & Migration
23. Renderer Behavior
24. Form Schemas — All Major Forms
25. Form Authoring Workflow

---

# PART A — COMPONENT LIBRARY

## 1. Foundations & Principles

### 1.1 Stack

- **Base library:** [shadcn/ui](https://ui.shadcn.com) — copy-paste components built on Radix UI primitives + Tailwind.
- **Reason for shadcn/ui over Material/Ant:** components live inside our repo, fully customizable, no version lock, no design-system bloat.
- **Form state:** [React Hook Form](https://react-hook-form.com) with [Zod](https://zod.dev) for validation.
- **Tables:** [TanStack Table v8](https://tanstack.com/table) (headless) + custom render.
- **Date logic:** [date-fns](https://date-fns.org) + [react-day-picker](https://daypicker.dev).
- **Icons:** [Lucide React](https://lucide.dev) — consistent, single-stroke style.
- **Animation:** Native CSS + Radix animations; avoid framer-motion unless needed.
- **Styling:** Tailwind CSS with CSS variables for theming.

### 1.2 Principles

| Principle | Meaning |
|-----------|---------|
| **One way to do anything** | Two components shouldn't solve the same problem. Choose one, document it, use it everywhere. |
| **Composition over configuration** | Small components compose into larger ones. A `<FormField>` wraps `<Label>`, an input, `<HelpText>`, `<ErrorText>`. |
| **Keyboard-first** | Every interaction has a keyboard equivalent. Hotkeys exposed via a global registry. |
| **Headless when possible** | Logic separate from look — TanStack Table is headless; we render it. Easier to customize. |
| **Stable APIs** | Component props don't change between minor releases. Renames go through deprecation. |
| **Dark-mode aware** | All colors via CSS variables; one toggle flips the app. |
| **High density on data screens, comfortable on forms** | Tables: 32 px rows. Forms: 44 px inputs. Don't compromise either way. |
| **No clever abstractions** | Read the source and understand it in 30 sec. Prefer obvious code. |

### 1.3 File Structure

```
src/ui/
├── components/        # primitive + composite
│   ├── button.tsx
│   ├── input.tsx
│   ├── select.tsx
│   ├── table/
│   │   ├── data-table.tsx
│   │   └── editable-grid.tsx
│   └── ...
├── forms/             # form builder
│   ├── form-renderer.tsx
│   ├── field-registry.tsx
│   └── validation.ts
├── schemas/           # form JSON schemas
│   ├── item.form.json
│   ├── customer.form.json
│   └── ...
├── theme/
│   ├── tokens.css     # CSS variables
│   └── theme.ts
└── hotkeys/
    └── registry.ts
```

## 2. Design Tokens

All design decisions are tokens — change a token, change the system.

### 2.1 Color Tokens (CSS variables)

```css
:root {
  /* Surface */
  --color-bg:               #ffffff;
  --color-bg-subtle:        #f8f9fa;
  --color-bg-muted:         #f1f3f5;
  --color-surface:          #ffffff;
  --color-surface-elevated: #ffffff;

  /* Border */
  --color-border:           #e5e7eb;
  --color-border-strong:    #d1d5db;
  --color-border-focus:     #2563eb;

  /* Text */
  --color-text:             #111827;
  --color-text-muted:       #6b7280;
  --color-text-subtle:      #9ca3af;
  --color-text-inverse:     #ffffff;

  /* Brand / accent */
  --color-primary:          #2563eb;
  --color-primary-hover:    #1d4ed8;
  --color-primary-active:   #1e40af;
  --color-primary-fg:       #ffffff;
  --color-primary-subtle:   #eff6ff;

  /* Status */
  --color-success:          #16a34a;
  --color-success-subtle:   #dcfce7;
  --color-warning:          #d97706;
  --color-warning-subtle:   #fef3c7;
  --color-danger:           #dc2626;
  --color-danger-subtle:    #fee2e2;
  --color-info:             #0284c7;
  --color-info-subtle:      #e0f2fe;

  /* Focus ring */
  --ring-color:             rgba(37, 99, 235, 0.4);
  --ring-width:             2px;
}

[data-theme="dark"] {
  --color-bg:               #0a0a0a;
  --color-bg-subtle:        #131313;
  --color-bg-muted:         #1a1a1a;
  --color-surface:          #131313;
  --color-surface-elevated: #1a1a1a;
  --color-border:           #262626;
  --color-border-strong:    #404040;
  --color-text:             #f5f5f5;
  --color-text-muted:       #a3a3a3;
  --color-text-subtle:      #737373;
  /* ... primary stays close, status colors slightly desaturated */
}
```

### 2.2 Spacing Scale

| Token | Value | Use |
|-------|-------|-----|
| `space-0` | 0 | — |
| `space-0.5` | 2 px | hair-spacing |
| `space-1` | 4 px | tight gaps |
| `space-2` | 8 px | between related items |
| `space-3` | 12 px | between fields (default) |
| `space-4` | 16 px | between groups |
| `space-5` | 20 px | section gap (sm) |
| `space-6` | 24 px | section gap (md) |
| `space-8` | 32 px | section gap (lg) |
| `space-12` | 48 px | page section break |
| `space-16` | 64 px | hero spacing |

### 2.3 Typography Scale

| Token | Size | Line Height | Weight | Use |
|-------|------|-------------|--------|-----|
| `text-xs` | 11 px | 1.4 | 400 | Captions, table sub-text |
| `text-sm` | 13 px | 1.5 | 400 | Tables, dense UI |
| `text-base` | 14 px | 1.5 | 400 | Default body, form inputs |
| `text-md` | 15 px | 1.5 | 500 | Emphasized body |
| `text-lg` | 17 px | 1.4 | 500 | Section headings |
| `text-xl` | 20 px | 1.3 | 600 | Card titles |
| `text-2xl` | 24 px | 1.2 | 600 | Page titles |
| `text-3xl` | 30 px | 1.2 | 700 | KPI numbers |
| `text-4xl` | 36 px | 1.1 | 700 | Display |

Number-heavy contexts use `font-feature-settings: 'tnum'` (tabular figures).

### 2.4 Radius Scale

| Token | Value | Use |
|-------|-------|-----|
| `radius-none` | 0 | Tables |
| `radius-sm` | 4 px | Tags, badges |
| `radius-md` | 6 px | Inputs, buttons (default) |
| `radius-lg` | 10 px | Cards, modals |
| `radius-xl` | 16 px | Hero cards |
| `radius-full` | 9999 px | Pills, avatars |

### 2.5 Shadow / Elevation

| Token | Use |
|-------|-----|
| `shadow-none` | Default — borders carry the weight |
| `shadow-sm` | Hover state, lightly elevated |
| `shadow-md` | Popovers, dropdowns |
| `shadow-lg` | Modals, drawers |
| `shadow-xl` | Toast notifications |

Tokens defined as Tailwind utilities; design system never uses arbitrary values in components.

### 2.6 Motion

| Token | Value | Use |
|-------|-------|-----|
| `duration-instant` | 50 ms | Hover state, simple feedback |
| `duration-fast` | 150 ms | Most transitions |
| `duration-base` | 250 ms | Drawers, modals |
| `duration-slow` | 400 ms | Page transitions, reveals |
| `easing-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default |
| `easing-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Reversible interactions |

## 3. Component Inventory

| Category | Components |
|----------|------------|
| **Primitives** | Button, IconButton, Input, NumberInput, CurrencyInput, QuantityInput, Textarea, Select, MultiSelect, Lookup, DatePicker, DateRangePicker, TimePicker, Checkbox, CheckboxGroup, Radio, RadioGroup, Switch, Slider, TagInput, BarcodeInput, FileUpload, ImageUpload, ColorPicker |
| **Composite** | FormField, AddressBlock, PhoneInput, GSTINInput, PercentInput, Stepper, SearchBox, FilterBar |
| **Layout** | Stack, Inline, Grid, Container, Card, Divider, Spacer, Tabs, Accordion |
| **Overlay** | Dialog (Modal), Drawer, Popover, Tooltip, ContextMenu, Toast, CommandPalette |
| **Feedback** | Alert, Banner, Badge, Tag, Spinner, ProgressBar, Skeleton, EmptyState, ErrorBoundary |
| **Data display** | DataTable, EditableGrid, TreeView, List, KeyValueList, Stat, Avatar, BarcodeRender, QRRender |
| **Navigation** | Sidebar, TopBar, Breadcrumb, Pagination |
| **Special** | PriceDisplay, QuantityDisplay, StatusBadge, DateDisplay, RelativeTime, DiffViewer |

About 60 components. Most are thin wrappers around Radix primitives + Tailwind classes.

## 4. Primitive Components

### 4.1 Button

**Purpose:** Trigger an action.

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'destructive' \| 'outline' \| 'link'` | `'secondary'` | |
| `size` | `'sm' \| 'md' \| 'lg' \| 'icon'` | `'md'` | |
| `loading` | `boolean` | `false` | Shows spinner, disables click |
| `disabled` | `boolean` | `false` | |
| `iconLeft` | `ReactNode` | — | Lucide icon |
| `iconRight` | `ReactNode` | — | |
| `hotkey` | `string` | — | E.g. `"Ctrl+S"` — auto-binds and shows in tooltip |
| `onClick` | `() => void` | — | |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | |
| `fullWidth` | `boolean` | `false` | |

**Sizes:**
| Size | Height | Padding-X | Text |
|------|--------|-----------|------|
| sm | 28 px | 12 px | text-sm |
| md | 36 px | 16 px | text-base |
| lg | 44 px | 24 px | text-md |
| icon | 36 px | 0 | square |

**States:** default · hover · active · focus (ring) · disabled · loading.

**Keyboard:** Enter/Space triggers click. If `hotkey` defined, global listener.

**Accessibility:**
- `<button>` element (not `<div>`).
- `aria-busy` when loading.
- `aria-disabled` when disabled.
- Visible focus ring.

**Code example:**
```tsx
<Button variant="primary" hotkey="F12" iconLeft={<Printer />} loading={saving}>
  Save & Print
</Button>
```

### 4.2 Input (Text)

**Purpose:** Single-line text entry.

**Props:**
| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `type` | `'text' \| 'email' \| 'tel' \| 'url' \| 'password' \| 'search'` | `'text'` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | |
| `value` | `string` | — | Controlled |
| `defaultValue` | `string` | — | Uncontrolled |
| `onChange` | `(value: string) => void` | — | |
| `placeholder` | `string` | — | |
| `maxLength` | `number` | — | |
| `prefix` | `ReactNode` | — | Inline left adornment (icon or text) |
| `suffix` | `ReactNode` | — | Right adornment |
| `clearable` | `boolean` | `false` | Show × to clear |
| `error` | `boolean` | `false` | Red ring |
| `disabled` | `boolean` | `false` | |
| `readOnly` | `boolean` | `false` | |
| `autoFocus` | `boolean` | `false` | |
| `mask` | `string` | — | E.g. `"##/##/####"` |
| `autoComplete` | `string` | `'off'` | |
| `selectOnFocus` | `boolean` | `false` | Select all text on focus — useful in tables |

**Sizes:**
| Size | Height | Text |
|------|--------|------|
| sm | 28 px | text-sm |
| md | 36 px | text-base |
| lg | 44 px | text-md |

**Visual states:** default · focus (border + ring) · error · disabled · readOnly.

**Keyboard:** standard text-input behavior. Escape clears if `clearable`.

**Accessibility:** Always pair with `<Label htmlFor>` via `FormField`. `aria-invalid` on error. `aria-describedby` for help text.

### 4.3 NumberInput

**Purpose:** Numeric entry with min/max/step and increment buttons.

**Props additional to Input:**
| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `min` | `number` | `-Infinity` | |
| `max` | `number` | `Infinity` | |
| `step` | `number` | `1` | |
| `precision` | `number` | `0` | Decimal places |
| `allowNegative` | `boolean` | `true` | |
| `showStepper` | `boolean` | `true` | Up/down buttons |
| `thousandSeparator` | `string` | `","` | Indian comma grouping handled separately |
| `indianGrouping` | `boolean` | `false` | 1,23,456 format |

**Keyboard:** ↑/↓ to increment/decrement by `step`; Shift+↑/↓ by 10× step; Page Up/Down by 100× step.

**Behavior:** Strips non-numeric on paste. Constrains on blur. Empty string ≠ 0.

### 4.4 CurrencyInput

Wraps NumberInput with:
- `prefix="₹"`.
- `precision={2}`.
- `indianGrouping={true}` by default.
- `min={0}` by default (override for refunds).
- Returns value as string (e.g. `"1234.56"`) to avoid float issues.

### 4.5 QuantityInput

Wraps NumberInput with:
- `precision={3}`.
- `suffix={unit}` — pass `unit="KG"` etc.
- `min={0}` by default.
- Selects on focus by default.

### 4.6 Textarea

**Props:**
| Prop | Type | Default | Notes |
|------|------|---------|-------|
| `value` | `string` | — | |
| `onChange` | `(value: string) => void` | — | |
| `rows` | `number` | `3` | |
| `autoResize` | `boolean` | `true` | Grow with content |
| `maxRows` | `number` | `10` | When `autoResize` |
| `maxLength` | `number` | — | |
| `showCount` | `boolean` | `false` | "120 / 500" below |
| `placeholder` | `string` | — | |
| `error` | `boolean` | `false` | |
| `disabled` | `boolean` | `false` | |

### 4.7 Select (Dropdown)

**Purpose:** Pick one value from a small-to-medium list.

**Props:**
| Prop | Type | Notes |
|------|------|-------|
| `options` | `{ value, label, disabled?, group? }[]` | |
| `value` | `string` | |
| `onChange` | `(value: string) => void` | |
| `placeholder` | `string` | "Select…" |
| `searchable` | `boolean` | For lists > 8 items |
| `clearable` | `boolean` | |
| `size` | `'sm' \| 'md' \| 'lg'` | |
| `error` | `boolean` | |
| `disabled` | `boolean` | |

**Keyboard:** Type to filter (if `searchable`). ↑/↓ navigate. Enter select. Escape close.

**Behavior:** Built on Radix Select for accessibility (proper aria-*, focus management).

### 4.8 MultiSelect

Like Select but multi-value. Returns `string[]`. Renders selected as chips inside the input area.

### 4.9 Lookup (Type-ahead)

**Purpose:** The workhorse for selecting items, customers, vendors, etc. — large datasets, server-backed search.

**Props:**
| Prop | Type | Notes |
|------|------|-------|
| `entity` | `string` | E.g. `'items'`, `'customers'` — drives endpoint |
| `value` | `string \| null` | Selected entity ID |
| `onChange` | `(id, fullObject) => void` | |
| `searchEndpoint` | `string` | Override default (`/v1/{entity}/lookup`) |
| `renderOption` | `(entity) => ReactNode` | Customize row |
| `renderSelected` | `(entity) => ReactNode` | Customize selected display |
| `createInline` | `boolean` | Show "+ Create new" option |
| `onCreateInline` | `(query) => void` | Opens mini-create form |
| `minSearchLength` | `number` | Default 2 |
| `debounceMs` | `number` | Default 200 |
| `pageSize` | `number` | Default 20 |
| `filters` | `object` | Extra params sent to endpoint |
| `barcode` | `boolean` | Listen for barcode-scanner pattern |
| `quickKeys` | `boolean` | When focused, F2/F3 open create forms |

**Keyboard flow** (in POS):
1. Focus → cursor in input.
2. Type 2 chars → results appear after 200ms debounce.
3. ↓ navigates list, ↑ goes up.
4. Enter selects highlighted.
5. Esc clears & closes.
6. If `createInline` and no result: bottom row "Create '{query}'" — Enter triggers mini-create.

**Barcode mode:** intercepts rapid keystrokes ending in Enter/LF (within ~50ms span), bypasses search, looks up directly via `GET /v1/barcodes/resolve/{code}` and selects.

### 4.10 DatePicker

**Props:**
| Prop | Type | Notes |
|------|------|-------|
| `value` | `string \| null` | ISO date string |
| `onChange` | `(value: string \| null) => void` | |
| `format` | `string` | Display format, default `'dd-MM-yyyy'` |
| `min` | `string` | Min selectable |
| `max` | `string` | Max selectable |
| `placeholder` | `string` | |
| `presets` | `{ label, value }[]` | E.g. Today / Yesterday / Last 7 days |
| `weekStartsOn` | `0\|1\|...` | 0 = Sunday |
| `showWeekNumbers` | `boolean` | |
| `disabled` | `boolean` | |
| `error` | `boolean` | |

**Keyboard:**
| Key | Action |
|-----|--------|
| Arrow keys | Move within calendar |
| Page Up/Down | Previous/next month |
| Shift+Page Up/Down | Previous/next year |
| Home/End | Start/end of week |
| Enter | Select date |
| T | Today |
| Esc | Close |
| Direct typing | `30-05-2026` or `30/05/2026` or `today`, `tomorrow`, `+7d`, `-1m` shorthand |

**Behavior:** Inline display "30-05-2026" + calendar icon. Click anywhere on input opens calendar popover.

### 4.11 DateRangePicker

Two `DatePicker`s side by side OR single calendar with range selection. Includes preset buttons:
- Today, Yesterday
- This Week, Last Week
- This Month, Last Month
- This FY, Last FY
- Last 7 / 30 / 90 days
- Custom

Returns `{ from: string, to: string }`.

### 4.12 TimePicker

Hour/minute spinners or text entry. 12h or 24h based on locale. Useful for "Promised by" on job cards.

### 4.13 Checkbox

Standard. Supports indeterminate state. Used in tables for row selection.

```tsx
<Checkbox checked={value} onChange={onChange} label="Track inventory" />
```

### 4.14 Radio / RadioGroup

```tsx
<RadioGroup value={value} onChange={onChange}>
  <Radio value="cash" label="Cash" />
  <Radio value="card" label="Card" />
</RadioGroup>
```

Horizontal or vertical via `orientation` prop.

### 4.15 Switch

Toggle for boolean settings. Larger touch target than Checkbox; preferred in Settings.

### 4.16 TagInput

Free-form chip entry — type, press Enter or comma to add a chip. Each chip has × to remove.

```tsx
<TagInput value={tags} onChange={setTags} suggestions={existingTags} maxItems={10} />
```

### 4.17 BarcodeInput

A specialized Input that:
- Auto-detects keyboard-wedge scanner input (rapid keystrokes + terminator).
- Optionally uses device camera (`BarcodeDetector` API).
- Returns `{ barcode, symbology }` on detection.
- Falls back to manual entry.

```tsx
<BarcodeInput onScan={(code) => addItemByBarcode(code)} mode="hybrid" />
```

### 4.18 FileUpload / ImageUpload

Drag-drop zone OR click-to-browse. Per file:
- Progress bar.
- Preview thumbnail (images).
- Delete button.
- Error message if rejected.

ImageUpload adds client-side resize before upload.

```tsx
<ImageUpload accept="image/*" maxSize={2_000_000} resizeTo={800} multiple onUploaded={(urls)=>{}} />
```

## 5. Composite Components

### 5.1 FormField

**The single most important wrapper.** Every input in a form is wrapped in `<FormField>`.

```tsx
<FormField
  label="Item Name"
  required
  error={errors.name?.message}
  hint="Used in invoice line description"
  helpLink="https://docs.counter.app/items"
>
  <Input {...register('name')} />
</FormField>
```

Renders:
```
┌──────────────────────────────────────────┐
│ Item Name *                       (info?)│
│ ┌──────────────────────────────────────┐ │
│ │ [input]                              │ │
│ └──────────────────────────────────────┘ │
│ Used in invoice line description         │
│ ⚠ This field is required                 │
└──────────────────────────────────────────┘
```

Layout variants:
- `layout="stacked"` (default): label above.
- `layout="horizontal"`: label left, input right.
- `layout="floating"`: floating label (avoid in dense forms).

### 5.2 AddressBlock

Composite for billing/shipping addresses — 5 fields (line1, line2, city, state, pincode) laid out in a sensible grid, with a "Same as billing" toggle when used twice.

### 5.3 PhoneInput

Input with country code selector. Phase 1: locked to `+91`. Validation: 10 digits starting 6–9.

### 5.4 GSTINInput

Input with built-in GSTIN format validation, state-code auto-extraction, and checksum verification. Shows a green check or red cross live.

```tsx
<GSTINInput value={value} onChange={onChange} onValidated={(stateCode)=>{}} />
```

### 5.5 PercentInput

NumberInput with `suffix="%"`, precision 2, min 0, max 100 by default.

### 5.6 SearchBox

A focused styled Input with search icon, debounced onChange, "clear" button, and optional command shortcut hint (`Ctrl+K`).

### 5.7 FilterBar

Standardized filter strip used on every list screen. Builds from a config object:

```tsx
<FilterBar
  filters={[
    { id: 'date', type: 'date_range', label: 'Date', default: 'this_month' },
    { id: 'status', type: 'multi_select', label: 'Status', options: [...] },
    { id: 'customer_id', type: 'lookup', label: 'Customer', entity: 'customers' },
  ]}
  value={filters}
  onChange={setFilters}
  onClear={() => setFilters({})}
/>
```

Active filters render as removable chips below the bar.

## 6. Data Display Components

### 6.1 DataTable (the big one)

**Purpose:** Power every list screen — invoices, items, customers, ledger, etc.

**Built on:** TanStack Table v8 (headless logic) + custom rendering.

**Props:**
| Prop | Type | Notes |
|------|------|-------|
| `data` | `T[]` | rows |
| `columns` | `ColumnDef<T>[]` | column definitions |
| `getRowId` | `(row) => string` | for stable selection |
| `loading` | `boolean` | shows skeleton rows |
| `error` | `string` | shows error state |
| `empty` | `ReactNode` | empty state slot |
| `pagination` | `'cursor' \| 'page' \| 'none'` | |
| `pageSize` | `number` | default 50 |
| `serverSide` | `boolean` | filters/sorts go to server |
| `onFilterChange`, `onSortChange`, `onPageChange` | callbacks | |
| `selectable` | `'none' \| 'single' \| 'multi'` | |
| `selectedIds` | `string[]` | |
| `onSelectionChange` | `(ids) => void` | |
| `density` | `'compact' \| 'normal' \| 'comfortable'` | row height |
| `virtualized` | `boolean` | for > 1000 rows |
| `stickyHeader` | `boolean` | default true |
| `rowActions` | `(row) => Action[]` | overflow menu per row |
| `bulkActions` | `Action[]` | shown when selection > 0 |
| `onRowClick` | `(row) => void` | |
| `onRowDoubleClick` | `(row) => void` | |
| `quickFilter` | `boolean` | client-side search box |
| `columnVisibility` | `Record<string, boolean>` | user-toggleable columns |
| `frozenColumns` | `{ left: number, right: number }` | sticky columns |
| `expandable` | `(row) => ReactNode` | row-detail expansion |
| `groupBy` | `string` | groups rows by column |

**Built-in features:**
- Click column header to sort (asc → desc → none).
- Right-click header → column menu (hide, pin, group by, freeze).
- Keyboard navigation: ↑/↓/←/→ within cells, Enter opens row, Space selects.
- Resize columns by dragging dividers.
- Reorder columns by dragging headers.
- Export filtered view to CSV.
- Save view (column visibility + filter + sort) as a named preset.

**Column definition example:**
```tsx
const columns: ColumnDef<Invoice>[] = [
  {
    id: 'invoice_no',
    header: 'Invoice #',
    accessorKey: 'invoice_no',
    cell: ({ row }) => <code className="font-mono">{row.original.invoice_no}</code>,
    sortable: true,
    width: 140,
  },
  {
    id: 'invoice_date',
    header: 'Date',
    accessorKey: 'invoice_date',
    cell: ({ getValue }) => <DateDisplay value={getValue() as string} />,
    sortable: true,
  },
  {
    id: 'grand_total',
    header: 'Amount',
    accessorKey: 'grand_total',
    cell: ({ getValue }) => <PriceDisplay value={getValue() as string} />,
    sortable: true,
    align: 'right',
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'payment_status',
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
];
```

### 6.2 EditableGrid

**Purpose:** Inline-edit table used for invoice lines, PO lines, BOM components, job card parts, etc. **Different beast from DataTable.**

**Built on:** Same TanStack Table base but with cell-edit semantics.

**Props additional to DataTable:**
| Prop | Type | Notes |
|------|------|-------|
| `addRowOnEnter` | `boolean` | Enter on last cell adds new row |
| `deleteRowKey` | `string` | `'Delete'` removes row |
| `editableColumns` | `string[]` | which columns are editable |
| `onCellEdit` | `(rowId, colId, value) => void` | |
| `onRowAdd` | `() => void` | |
| `onRowDelete` | `(rowId) => void` | |
| `validateCell` | `(row, col, value) => string \| null` | live validation |
| `computeRow` | `(row) => row` | recompute derived fields (e.g. line total) |
| `aggregateRow` | `(rows) => Record<string, any>` | summary row (subtotal) |

**Cell editing keyboard flow:**
- Click cell or Tab into it → edit mode (input becomes visible).
- Tab → next editable cell (skips read-only).
- Shift+Tab → previous.
- Enter → confirm + move down (or add row if last).
- Esc → cancel current edit.
- Type with text input focused: replaces value.
- Type with cell selected (not in edit): starts edit with that character.

**Cell types** map to primitive components:
- `text` → Input
- `number` → NumberInput
- `currency` → CurrencyInput
- `quantity` → QuantityInput
- `lookup` → Lookup
- `select` → Select
- `date` → DatePicker
- `checkbox` → Checkbox
- `display` (read-only) → text node

**Example cell definition:**
```tsx
{
  id: 'qty',
  header: 'Qty',
  accessorKey: 'qty',
  type: 'quantity',
  editable: true,
  width: 90,
  align: 'right',
  validate: (row, value) => Number(value) > 0 ? null : 'Must be positive',
  onEdit: (row, value, table) => {
    // Update qty + recompute line total
    table.updateRow(row.id, { qty: value, ...computeLine({ ...row, qty: value }) });
  },
},
```

### 6.3 TreeView

For category trees, BOM hierarchies. Lazy-load children on expand.

### 6.4 List

Compact vertical list. Used in side panels (recent activity, notifications, alerts).

### 6.5 KeyValueList

For displaying record details:
```tsx
<KeyValueList items={[
  { label: 'Invoice No', value: 'INV-0123' },
  { label: 'Date', value: <DateDisplay value="2026-05-30" /> },
  { label: 'Customer', value: 'Ravi Sharma' },
]} />
```

### 6.6 Stat (KPI Card)

```tsx
<Stat
  label="Today's Sales"
  value="₹ 1,24,500"
  delta="+12%"
  trend="up"
  sparkline={[12, 14, 13, 18, 22, 19, 25]}
  onClick={openSalesReport}
/>
```

### 6.7 StatusBadge

Color-coded by status string. Built-in mappings:
- `paid` / `delivered` / `completed` / `active` → green
- `partial` / `pending` / `in_progress` → amber
- `unpaid` / `overdue` / `failed` → red
- `voided` / `cancelled` / `inactive` → gray
- `draft` → blue

### 6.8 PriceDisplay

Formats money with ₹ symbol, Indian grouping, configurable precision. Negative values in red parens optionally.

```tsx
<PriceDisplay value="123456.78" currency="INR" />  // ₹ 1,23,456.78
```

### 6.9 QuantityDisplay

`<QuantityDisplay value="2.500" unit="KG" />` → `2.500 KG`. Trims trailing zeros if `trimZeros` prop set.

### 6.10 DateDisplay / RelativeTime

`<DateDisplay value="2026-05-30" />` → `30-05-2026` (locale-aware).
`<RelativeTime value="2026-05-30T10:00:00Z" />` → `2 hours ago` / `Yesterday at 4:32 PM`.

### 6.11 BarcodeRender / QRRender

Inline SVG generators for printing labels and invoice QRs.

### 6.12 DiffViewer

Side-by-side or unified diff of two JSON objects (used in audit log viewer).

## 7. Layout Components

### 7.1 Stack

Vertical flex with consistent gap.

```tsx
<Stack gap={4}>
  <FormField ... />
  <FormField ... />
</Stack>
```

### 7.2 Inline

Horizontal flex with consistent gap.

```tsx
<Inline gap={2} align="center">
  <Button>Save</Button>
  <Button variant="ghost">Cancel</Button>
</Inline>
```

### 7.3 Grid

CSS Grid wrapper with responsive columns.

```tsx
<Grid columns={{ base: 1, md: 2, lg: 3 }} gap={4}>
  ...
</Grid>
```

### 7.4 Container

Constrains max-width, centers horizontally. `size="sm" | "md" | "lg" | "xl" | "full"`.

### 7.5 Card

Visual container with border + optional header / footer.

```tsx
<Card>
  <CardHeader title="Customer Details" actions={<Button>Edit</Button>} />
  <CardBody>...</CardBody>
  <CardFooter>...</CardFooter>
</Card>
```

### 7.6 Tabs

Radix Tabs wrapped. Hotkey: Ctrl+Tab / Ctrl+Shift+Tab to traverse.

```tsx
<Tabs value={tab} onChange={setTab}>
  <TabList>
    <Tab value="general">General</Tab>
    <Tab value="pricing">Pricing</Tab>
  </TabList>
  <TabPanel value="general">...</TabPanel>
  <TabPanel value="pricing">...</TabPanel>
</Tabs>
```

### 7.7 Accordion

Multi-section collapse. Used in Settings, FAQs.

### 7.8 Divider

Horizontal rule with optional centered label.

### 7.9 Spacer

Pure spacing element. `<Spacer size={4} />`.

## 8. Feedback Components

### 8.1 Alert

In-flow message:
```tsx
<Alert variant="warning" title="Low stock" actions={<Button>Create PO</Button>}>
  3 items are below reorder level.
</Alert>
```

Variants: info, success, warning, danger.

### 8.2 Toast

Floating notification, auto-dismiss. Triggered via hook:
```tsx
const toast = useToast();
toast.success('Invoice saved');
toast.error('Sync failed', { action: { label: 'Retry', onClick: retry } });
```

### 8.3 Dialog (Modal)

```tsx
<Dialog open={open} onOpenChange={setOpen} size="md">
  <DialogHeader title="Void Invoice" />
  <DialogBody>...</DialogBody>
  <DialogFooter>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <Button variant="destructive" onClick={confirm}>Void</Button>
  </DialogFooter>
</Dialog>
```

Sizes: sm (400 px), md (560 px), lg (760 px), xl (960 px), full.

### 8.4 Drawer

Side panel. Used for "Detail" views in lists (click invoice → drawer opens with detail), avoiding full page navigation.

### 8.5 Spinner / Skeleton / ProgressBar

Loading states. Skeleton is the default for "I'm fetching"; Spinner for "I'm processing"; ProgressBar for "I know how much is done".

### 8.6 EmptyState

```tsx
<EmptyState
  icon={<Package />}
  title="No items yet"
  description="Add your first item to start billing."
  action={<Button hotkey="Ctrl+N">Add Item</Button>}
/>
```

### 8.7 ErrorBoundary

Wraps each major route. Renders a friendly error screen with "Reload", "Report bug", and the error ID.

## 9. Navigation Components

### 9.1 Sidebar

Left rail. Collapsible (220 → 56 px). Items defined as a config:

```ts
const nav = [
  { id: 'dashboard', label: 'Dashboard', icon: <Home />, path: '/', hotkey: 'Alt+1' },
  { id: 'pos', label: 'Billing', icon: <Receipt />, path: '/pos', hotkey: 'F2' },
  { id: 'inventory', label: 'Inventory', icon: <Package />, hotkey: 'Alt+3', children: [
    { id: 'items', label: 'Items', path: '/items' },
    { id: 'stock', label: 'Stock Ledger', path: '/stock' },
  ]},
  ...
];
```

### 9.2 TopBar

Org/branch selector, global search (Cmd+K trigger), notifications bell, user menu, sync status pill.

### 9.3 CommandPalette (Cmd+K)

A modal launcher. Indexed sources:
- Recent items/customers/invoices.
- All navigation entries.
- Action commands ("New Invoice", "Print last bill").
- Settings shortcuts.
- Help links.

Fuzzy search via Fuse.js. Each result has a hotkey badge if applicable.

### 9.4 Breadcrumb

For deep settings pages.

### 9.5 Pagination

Cursor or page-based. Server-side aware.

## 10. Accessibility & Keyboard Standards

| Concern | Rule |
|---------|------|
| Focus visibility | Visible 2 px ring on all interactives |
| Tab order | Matches visual order — no `tabIndex > 0` |
| Skip link | "Skip to main content" link at top of every page |
| Screen reader labels | Icon-only buttons have `aria-label` |
| Color | Never sole indicator; pair with icon/text |
| Contrast | WCAG AA: 4.5:1 text, 3:1 UI components |
| Touch targets | ≥ 44×44 px on mobile |
| Keyboard | Every action reachable without mouse |
| Motion | Respect `prefers-reduced-motion`; disable non-essential animation |
| Forms | Each input labeled; errors announced via `aria-live="polite"` |
| Modals | Focus trap; Esc closes; restores focus to trigger |

## 11. Theming & Customization

- Theme = CSS variable values. One file (`tokens.css`) holds all defaults.
- Dark mode = `<html data-theme="dark">` flips a variable set.
- Org-specific accents: org admin picks accent color from a palette in Settings → Branding → applies via inline `<style>` injection at app boot.
- Density: user pref `compact | normal | comfortable` adjusts `--row-height`, `--input-height`, `--space-default`.
- White-label option (Phase 3): per-org swap of brand color + logo across UI; per-org domain (`{org}.counter.app`).

---

# PART B — JSON FORM BUILDER

## 12. Why JSON Forms

Every CRUD form in Counter is defined as a JSON schema, not as bespoke React. Reasons:

| Benefit | Result |
|---------|--------|
| **Custom Fields work natively** | Add a custom field via Settings → it appears in the form, no deploy |
| **Industry profiles toggle fields** | Profile = Workshop → "Vehicle" field appears on Customer form, all driven by JSON |
| **One renderer, every form** | Bug-fix in renderer benefits every form |
| **Easy A/B / experimentation** | Swap layouts via JSON |
| **Schema validation = single source of truth** | Same Zod schema generated from JSON drives client + API validation |
| **Form preview / live editor** | Settings → Forms → drag fields to reorder, edit JSON |
| **Localization** | Strings in JSON map to i18n keys |
| **Versioned forms** | Old invoices keep their original form schema for replay |
| **Permissions per field** | Easy field-level access control |
| **AI-generated form modifications** | LLM can edit JSON safely, can't break compilation |

## 13. Schema Specification

Top-level form schema:

```json
{
  "$schema": "counter-form/v1",
  "form_id": "item.create_edit",
  "version": "1.0.0",
  "title": { "i18n": "form.item.title" },
  "entity": "items",
  "mode": "create_or_edit",
  "permissions": {
    "view": ["item.view"],
    "edit": ["item.edit"],
    "create": ["item.create"]
  },
  "layout": { /* see §18 */ },
  "fields": { /* map of field_id → field definition */ },
  "computed": { /* derived/aggregated field rules */ },
  "validation": {
    "cross_field": [ /* rules involving multiple fields */ ],
    "on_submit": [ /* async validations like uniqueness check */ ]
  },
  "actions": [
    { "id": "save", "label": { "i18n": "action.save" }, "hotkey": "Ctrl+S", "endpoint": "POST /v1/items", "on_success": "close" },
    { "id": "save_and_new", "label": { "i18n": "action.save_and_new" }, "hotkey": "Ctrl+Shift+S", "endpoint": "POST /v1/items", "on_success": "reset" }
  ],
  "side_effects": [
    { "on": "field_change", "field": "is_batched", "action": "show_field", "target": "shelf_life_days" }
  ]
}
```

### 13.1 Top-Level Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `$schema` | string | Y | Schema version identifier |
| `form_id` | string | Y | Globally unique form identifier |
| `version` | semver | Y | Schema version for migration tracking |
| `title` | i18nString | Y | Form title |
| `entity` | string | Y | DB entity / API resource the form maps to |
| `mode` | enum | Y | `create_only \| edit_only \| create_or_edit \| view_only` |
| `permissions` | object | Y | Permission keys required |
| `layout` | object | Y | Layout definition |
| `fields` | object | Y | Field definitions keyed by field_id |
| `computed` | object | N | Computed/derived field rules |
| `validation` | object | N | Validation rules |
| `actions` | array | Y | Available actions |
| `side_effects` | array | N | Conditional UI behaviors |

## 14. Field Types Catalog

Every field has a `type` that maps to a registered component.

### 14.1 Universal Field Properties

```json
{
  "type": "text",
  "label": { "i18n": "field.item.name" },
  "hint": { "i18n": "field.item.name.hint" },
  "placeholder": { "i18n": "field.item.name.placeholder" },
  "default": "string | number | { "auto": "ITM-{seq:5}" } | { "from_field": "x" } | { "from_setting": "y" }",
  "validation": {
    "required": true,
    "min_length": 1,
    "max_length": 160,
    "pattern": "^[A-Z0-9-]+$",
    "custom": "validators.gstin"
  },
  "ui": {
    "size": "md",
    "width": "full | half | third | quarter",
    "autofocus": true,
    "select_on_focus": true,
    "readonly_after_create": false
  },
  "permissions": {
    "view": ["item.view"],
    "edit": ["item.edit_price"]
  },
  "depends_on": [ /* see Conditional Logic */ ],
  "computed": false
}
```

### 14.2 Field Type Registry

| `type` | Component | Notes |
|--------|-----------|-------|
| `text` | Input | Plain text |
| `email` | Input type=email | |
| `phone` | PhoneInput | India format default |
| `url` | Input type=url | |
| `password` | Input type=password | |
| `pin` | Input | Masked, length per setting |
| `gstin` | GSTINInput | Validation + state extraction |
| `pan` | Input | Validates PAN format |
| `barcode` | BarcodeInput | Scanner-aware |
| `number` | NumberInput | |
| `currency` | CurrencyInput | |
| `quantity` | QuantityInput | With unit |
| `percent` | PercentInput | 0–100 |
| `integer` | NumberInput precision=0 | |
| `textarea` | Textarea | |
| `rich_text` | RichTextEditor | Phase 2 |
| `select` | Select | Static options |
| `multi_select` | MultiSelect | |
| `radio` | RadioGroup | |
| `checkbox` | Checkbox | Single boolean |
| `switch` | Switch | Boolean, larger UI |
| `lookup` | Lookup | Server-backed type-ahead |
| `multi_lookup` | MultiLookup | Multiple selections |
| `date` | DatePicker | |
| `date_range` | DateRangePicker | Returns {from,to} |
| `time` | TimePicker | |
| `datetime` | DateTimePicker | |
| `tag_input` | TagInput | Chip list |
| `image` | ImageUpload | |
| `images` | ImageUpload multiple | |
| `file` | FileUpload | |
| `files` | FileUpload multiple | |
| `signature` | SignaturePad | Touch / mouse draw |
| `address` | AddressBlock | Composite |
| `color` | ColorPicker | |
| `code` | CodeEditor | For settings JSON, JS expressions |
| `grid` | EditableGrid | For repeating rows (invoice lines, BOM components) |
| `repeater` | RepeaterField | For repeating sub-forms (e.g. complaints on job card) |
| `display` | DisplayValue | Read-only computed display |
| `divider` | Divider | Visual separator |
| `heading` | Heading | Section title within form |
| `info` | InfoBanner | Static help banner |
| `hidden` | hidden input | Carries data not shown to user |

### 14.3 Field-Specific Properties

Per `type`, additional properties:

**`lookup`:**
```json
{
  "type": "lookup",
  "lookup": {
    "entity": "customers",
    "label_field": "name",
    "search_endpoint": "/v1/customers/lookup",
    "min_search_length": 2,
    "filters": { "status": "active" },
    "create_inline": true,
    "create_form_id": "customer.quick_create",
    "preload": false,
    "barcode": false
  }
}
```

**`select` / `radio` / `multi_select`:**
```json
{
  "type": "select",
  "options": [
    { "value": "retail", "label": { "i18n": "industry.retail" } },
    { "value": "workshop", "label": { "i18n": "industry.workshop" } }
  ]
}
```

Or dynamic options:
```json
{
  "options_endpoint": "/v1/payment-modes",
  "options_value_field": "id",
  "options_label_field": "name"
}
```

**`date`:**
```json
{
  "type": "date",
  "date": {
    "min": { "from_field": "mfg_date" },
    "max": "today",
    "presets": ["today", "tomorrow", "next_week"]
  }
}
```

**`number` / `currency` / `quantity`:**
```json
{
  "type": "currency",
  "number": { "min": 0, "max": null, "step": 1, "precision": 2 }
}
```

**`grid` (editable subtable):**
```json
{
  "type": "grid",
  "grid": {
    "row_entity": "invoice_lines",
    "row_form_id": "invoice_line",
    "min_rows": 1,
    "max_rows": 200,
    "add_row_label": "Add line",
    "delete_row_key": "Delete",
    "auto_add_on_enter": true,
    "columns": ["item_id", "qty", "unit_id", "rate", "discount_pct", "taxable_amt", "tax_amt", "total"],
    "summary_row": {
      "show": true,
      "fields": {
        "taxable_amt": "sum",
        "tax_amt": "sum",
        "total": "sum"
      }
    }
  }
}
```

**`repeater` (free-form repeating sub-form):**
```json
{
  "type": "repeater",
  "repeater": {
    "sub_form_id": "job_card_complaint",
    "min": 0,
    "max": 20,
    "add_label": "Add complaint",
    "delete_confirm": false
  }
}
```

## 15. Validation System

### 15.1 Built-in Validators

Per field:

| Rule | Example |
|------|---------|
| `required` | `"required": true` |
| `min_length`, `max_length` | `"max_length": 160` |
| `min`, `max` (numeric) | `"min": 0, "max": 100` |
| `pattern` (regex) | `"pattern": "^[A-Z]{3}\\d{4}$"` |
| `email`, `phone`, `gstin`, `pan`, `pincode`, `ifsc` | shorthand validators |
| `unique` (async) | `"unique": "items.sku"` — calls API |
| `enum` | `"enum": ["a","b","c"]` |
| `equals` | `"equals": { "field": "password" }` |
| `min_date`, `max_date` | `"min_date": "today"` or field reference |
| `min_items`, `max_items` (for arrays) | |
| `custom` | `"custom": "validators.checksum_gstin"` — registered function |

### 15.2 Cross-Field Validation

In `validation.cross_field`:

```json
[
  {
    "id": "expiry_after_mfg",
    "fields": ["mfg_date", "expiry_date"],
    "rule": "${expiry_date} > ${mfg_date}",
    "message": { "i18n": "validation.expiry_after_mfg" },
    "severity": "error"
  },
  {
    "id": "min_sale_warn",
    "fields": ["sale_price", "purchase_price"],
    "rule": "${sale_price} >= ${purchase_price}",
    "message": "Sale price is below cost — confirm?",
    "severity": "warning"
  }
]
```

`rule` is a tiny expression language. Supported operators: `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`, `+`, `-`, `*`, `/`. Field references use `${field_name}`. Functions allowed: `len()`, `sum()`, `isEmpty()`, `today()`, `now()`.

### 15.3 Async Validation

```json
{
  "on_submit": [
    {
      "id": "duplicate_invoice",
      "endpoint": "POST /v1/validations/duplicate-purchase",
      "request_fields": ["vendor_id", "vendor_invoice_no"],
      "block_on_fail": true
    }
  ]
}
```

Runs on submit before save. If `block_on_fail`, prevents submission.

### 15.4 Validation Severity

| Severity | Behavior |
|----------|----------|
| `error` | Blocks submit; red |
| `warning` | Allows submit; amber; user can override |
| `info` | Notification; never blocks |

## 16. Conditional Logic

`depends_on` array on fields controls visibility / enable / required state:

```json
{
  "shelf_life_days": {
    "type": "integer",
    "label": "Shelf life (days)",
    "depends_on": [
      {
        "when": "${is_batched} == true",
        "then": { "visible": true, "required": true }
      },
      {
        "when": "${is_batched} == false",
        "then": { "visible": false }
      }
    ]
  }
}
```

Effects available in `then`:
| Effect | Meaning |
|--------|---------|
| `visible: true/false` | Show/hide field |
| `enabled: true/false` | Enable/disable |
| `required: true/false` | Override required |
| `default: value` | Set value (only if untouched) |
| `value: value` | Force value |
| `options: [...]` | Override options |
| `lookup.filters: {...}` | Override lookup filters |

Multiple rules evaluated in order; later rules override earlier.

## 17. Computed Fields

Fields whose value is derived from others, not edited directly.

```json
{
  "computed": {
    "margin_amount": {
      "type": "currency",
      "label": "Margin",
      "formula": "${sale_price} - ${purchase_price}",
      "depends_on": ["sale_price", "purchase_price"]
    },
    "margin_pct": {
      "type": "percent",
      "label": "Margin %",
      "formula": "${purchase_price} > 0 ? (${margin_amount} / ${purchase_price}) * 100 : 0",
      "depends_on": ["margin_amount", "purchase_price"]
    },
    "line_total": {
      "type": "currency",
      "scope": "line",
      "formula": "${qty} * ${rate} - ${discount_amt} + ${tax_amt}",
      "depends_on": ["qty", "rate", "discount_amt", "tax_amt"]
    }
  }
}
```

`scope: "line"` means computed per row in an EditableGrid; default scope is form-level.

Computed fields are renderable via `type: "display"` in layout — they show but aren't saved by user input. Server recomputes them authoritatively on save.

## 18. Layouts

### 18.1 Layout Types

```json
{
  "layout": {
    "type": "stack | tabs | accordion | grid | wizard",
    ...
  }
}
```

### 18.2 Stack Layout

```json
{
  "layout": {
    "type": "stack",
    "sections": [
      {
        "id": "basic",
        "title": { "i18n": "section.basic" },
        "columns": 2,
        "fields": ["name", "phone", "email", "gstin"]
      },
      {
        "id": "address",
        "title": { "i18n": "section.address" },
        "columns": 1,
        "fields": ["billing_address"]
      }
    ]
  }
}
```

### 18.3 Tabs Layout

```json
{
  "layout": {
    "type": "tabs",
    "tabs": [
      {
        "id": "general",
        "title": { "i18n": "tab.general" },
        "sections": [
          { "id": "identity", "columns": 2, "fields": ["sku", "name", "category_id", "brand_id"] },
          { "id": "flags", "columns": 3, "fields": ["track_inventory", "is_service", "is_batched"] }
        ]
      },
      {
        "id": "pricing",
        "title": { "i18n": "tab.pricing" },
        "sections": [
          { "id": "base", "columns": 3, "fields": ["mrp", "sale_price", "purchase_price"] },
          { "id": "tiers", "columns": 1, "fields": ["price_tiers"] }
        ]
      },
      {
        "id": "stock",
        "title": { "i18n": "tab.stock" },
        "visible_when": "${track_inventory} == true",
        "sections": [...]
      }
    ]
  }
}
```

### 18.4 Wizard Layout

For onboarding-style sequential flows:
```json
{
  "layout": {
    "type": "wizard",
    "steps": [
      { "id": "step1", "title": "Organization", "fields": [...], "validate_before_next": true },
      { "id": "step2", "title": "Branch", "fields": [...] }
    ],
    "allow_back": true,
    "allow_skip": false
  }
}
```

### 18.5 Section Properties

| Property | Type | Notes |
|----------|------|-------|
| `id` | string | Required |
| `title` | i18nString | Optional |
| `description` | i18nString | Below title |
| `columns` | number | 1 / 2 / 3 / 4 (responsive) |
| `fields` | string[] | Field IDs in order |
| `visible_when` | expression | Conditional |
| `collapsible` | boolean | Section can collapse |
| `default_collapsed` | boolean | |

### 18.6 Field Width within Section

A section with `columns: 2` lays out fields in two columns by default. Individual fields can override via `ui.width`:

```json
{ "ui": { "width": "full" } }   // spans all columns
{ "ui": { "width": "half" } }   // default in a 2-col section
{ "ui": { "width": "third" } }
{ "ui": { "width": "quarter" } }
```

## 19. Field-Level Permissions

```json
{
  "purchase_price": {
    "type": "currency",
    "permissions": {
      "view": ["item.view_cost"],
      "edit": ["item.edit_cost"]
    }
  }
}
```

If user lacks `view`: field hidden entirely.
If user lacks `edit`: field shown read-only.

Permission keys come from the user's effective permission set (role + overrides).

## 20. Custom Fields Integration

Custom fields defined in Settings appear automatically in forms. The form schema doesn't need editing.

How it works: at render time the form renderer queries `GET /v1/custom-fields?entity=items` and merges into the schema:

- Custom fields are appended to a section called "Additional Information" (auto-created if not present in schema).
- Schema can pin custom fields to a specific section by referencing `__custom_fields` placeholder:

```json
{ "sections": [
  { "id": "general", "fields": ["name", "sku", "__custom_fields"] }
]}
```

Custom field definitions map to `type` per their `field_type`:
| Setting `field_type` | Schema `type` |
|---------------------|---------------|
| text | text |
| number | number |
| date | date |
| dropdown | select |
| boolean | checkbox |

## 21. Localization

All user-facing strings in JSON forms are either:
- Plain string (literal): `"label": "Item Name"`
- i18n reference: `"label": { "i18n": "field.item.name" }`

The renderer resolves i18n references against the active locale. Strings live in `locales/{lang}/forms.json`:

```json
{
  "field.item.name": "Item Name",
  "field.item.sku": "SKU / Item Code",
  "field.item.name.hint": "Used in invoice line description"
}
```

Fallback chain: requested locale → English → key itself (visible for debugging).

## 22. Versioning & Migration

Forms are versioned via `version`. When a form schema changes:

| Change Type | Action |
|-------------|--------|
| Add new optional field | Bump patch (1.0.0 → 1.0.1); no migration |
| Add new required field with default | Bump minor (1.0.x → 1.1.0); existing data unaffected |
| Rename a field | Bump major; migration JSON maps old → new keys |
| Remove a field | Bump major; existing data keeps the old field but it's not rendered |
| Change a field type | Bump major; migration function in `migrations/{form_id}/{v1→v2}.ts` |

Old data is preserved with its original schema version; rendering picks the schema that matches.

## 23. Renderer Behavior

### 23.1 Loading Sequence

1. Fetch schema (cached): `GET /v1/forms/{form_id}` (or local bundle).
2. Fetch custom fields for entity (cached).
3. Merge custom fields into schema.
4. Fetch initial data (if edit mode).
5. Initialize form state with React Hook Form using generated Zod schema.
6. Resolve i18n strings.
7. Render layout.

### 23.2 State Management

- Form state in React Hook Form.
- Each field registered via `register()` or controlled via `<Controller>`.
- Dirty state tracked per field; "unsaved changes" indicator.
- Computed fields recalculated on dependency change.
- Validation runs on blur per field + on submit fully.

### 23.3 Dirty State Handling

- Save button enabled only when dirty.
- Esc / navigate away prompts confirm.
- "Discard Changes" returns to last saved data.

### 23.4 Optimistic Updates

For edits in offline-first scenarios:
- Save writes locally + queues outbox.
- UI shows "Saved (syncing)".
- On server confirm, banner removes; on conflict, banner offers resolution.

### 23.5 Hotkeys

Form-level hotkeys from `actions` array bind on form mount. Field-level hotkeys (e.g. F2 inside a Lookup) bind only while focused.

### 23.6 Mobile Adaptation

On narrow viewports:
- Tabs → bottom-sheet pickers.
- Multi-column sections → single column.
- Grid columns → horizontal scroll OR collapse to mobile-friendly cards.
- Date picker → native input where available.

## 24. Form Schemas — All Major Forms

Below are abbreviated schemas. Each entity's full schema lives in `src/ui/schemas/`.

### 24.1 `item.create_edit.json` (Abbreviated)

```json
{
  "$schema": "counter-form/v1",
  "form_id": "item.create_edit",
  "version": "1.0.0",
  "title": { "i18n": "form.item.title" },
  "entity": "items",
  "mode": "create_or_edit",
  "permissions": {
    "view": ["item.view"],
    "edit": ["item.edit"],
    "create": ["item.create"]
  },
  "layout": {
    "type": "tabs",
    "tabs": [
      {
        "id": "general",
        "title": { "i18n": "tab.general" },
        "sections": [
          {
            "id": "identity",
            "columns": 2,
            "fields": ["sku", "name", "short_name", "description", "category_id", "brand_id", "hsn_code", "primary_unit_id"]
          },
          {
            "id": "flags",
            "columns": 3,
            "fields": ["track_inventory", "is_service", "is_batched", "has_variants", "allow_negative_stock", "status"]
          },
          {
            "id": "media",
            "columns": 1,
            "fields": ["images", "tags", "notes"]
          },
          { "id": "_custom_fields", "fields": ["__custom_fields"] }
        ]
      },
      {
        "id": "pricing",
        "title": { "i18n": "tab.pricing" },
        "sections": [
          { "id": "base", "columns": 3, "fields": ["mrp", "sale_price", "purchase_price"] },
          { "id": "flags", "columns": 2, "fields": ["price_includes_tax", "min_sale_price", "max_discount_pct"] },
          { "id": "tiers", "columns": 1, "fields": ["price_tiers"] },
          { "id": "margin", "columns": 2, "fields": ["margin_amount", "margin_pct"] }
        ]
      },
      {
        "id": "stock",
        "title": { "i18n": "tab.stock" },
        "visible_when": "${track_inventory} == true",
        "sections": [
          { "id": "opening", "columns": 1, "fields": ["opening_stock"] },
          { "id": "reorder", "columns": 3, "fields": ["reorder_level", "reorder_qty", "max_stock", "lead_time_days", "shelf_life_days"] },
          { "id": "storage", "columns": 2, "fields": ["storage_location", "weight_g", "dimensions"] }
        ]
      },
      {
        "id": "tax",
        "title": { "i18n": "tab.tax" },
        "sections": [
          { "id": "gst", "columns": 2, "fields": ["tax_rate_id", "cess_rate", "tax_exempt", "reverse_charge"] }
        ]
      },
      {
        "id": "barcodes",
        "title": { "i18n": "tab.barcodes" },
        "sections": [{ "id": "list", "columns": 1, "fields": ["barcodes"] }]
      },
      {
        "id": "variants",
        "title": { "i18n": "tab.variants" },
        "visible_when": "${has_variants} == true",
        "sections": [{ "id": "v", "columns": 1, "fields": ["variants"] }]
      },
      {
        "id": "manufacturing",
        "title": { "i18n": "tab.manufacturing" },
        "visible_when": "${is_finished_good} == true && ${profile} == 'manufacturer'",
        "sections": [
          { "id": "mfg", "columns": 2, "fields": ["default_bom_id", "default_batch_size", "production_lead_time_hrs"] }
        ]
      }
    ]
  },
  "fields": {
    "sku": {
      "type": "text",
      "label": { "i18n": "field.sku" },
      "validation": { "required": true, "max_length": 40, "pattern": "^[A-Z0-9_-]+$", "unique": "items.sku" },
      "default": { "auto": "ITM-{seq:5}" },
      "ui": { "width": "half" }
    },
    "name": {
      "type": "text",
      "label": { "i18n": "field.item.name" },
      "validation": { "required": true, "min_length": 1, "max_length": 160 },
      "ui": { "width": "half", "autofocus": true }
    },
    "short_name": {
      "type": "text",
      "label": { "i18n": "field.item.short_name" },
      "validation": { "max_length": 40 },
      "default": { "from_field": "name", "transform": "slice:0:40" }
    },
    "description": { "type": "textarea", "label": "Description", "validation": { "max_length": 500 }, "ui": { "width": "full" } },
    "category_id": {
      "type": "lookup",
      "label": "Category",
      "lookup": { "entity": "categories", "create_inline": true, "create_form_id": "category.quick_create" }
    },
    "brand_id": { "type": "lookup", "label": "Brand", "lookup": { "entity": "brands", "create_inline": true } },
    "hsn_code": {
      "type": "text",
      "label": "HSN / SAC",
      "validation": { "pattern": "^\\d{4,8}$", "required_when": "${org.is_gst_registered} == true" }
    },
    "primary_unit_id": { "type": "lookup", "label": "Unit", "lookup": { "entity": "units" }, "default": "PCS", "validation": { "required": true } },
    "track_inventory": { "type": "switch", "label": "Track Inventory", "default": true },
    "is_service": {
      "type": "switch", "label": "Is Service",
      "depends_on": [{ "when": "${is_batched} == true", "then": { "value": false, "enabled": false } }]
    },
    "is_batched": {
      "type": "switch", "label": "Is Batched (Mfg/Expiry)",
      "depends_on": [{ "when": "${is_service} == true", "then": { "value": false, "enabled": false } }]
    },
    "has_variants": { "type": "switch", "label": "Has Variants" },
    "allow_negative_stock": { "type": "switch", "label": "Allow Negative Stock", "default": false },
    "status": { "type": "radio", "label": "Status", "options": [{ "value": "active", "label": "Active" }, { "value": "inactive", "label": "Inactive" }], "default": "active" },
    "images": { "type": "images", "label": "Images", "validation": { "max_items": 5 } },
    "tags": { "type": "tag_input", "label": "Tags" },
    "notes": { "type": "textarea", "label": "Internal Notes", "rows": 2 },

    "mrp": { "type": "currency", "label": "MRP" },
    "sale_price": { "type": "currency", "label": "Sale Price", "validation": { "required": true, "min": 0 } },
    "purchase_price": { "type": "currency", "label": "Purchase Price", "permissions": { "view": ["item.view_cost"], "edit": ["item.edit_cost"] } },
    "price_includes_tax": { "type": "switch", "label": "Price Inclusive of Tax", "default": false },
    "min_sale_price": { "type": "currency", "label": "Min Sale Price" },
    "max_discount_pct": { "type": "percent", "label": "Max Discount %" },
    "price_tiers": {
      "type": "grid",
      "label": "Price Tiers",
      "grid": {
        "row_entity": "item_prices",
        "columns": ["price_tier_id", "min_qty", "price", "effective_from"],
        "min_rows": 0,
        "max_rows": 10
      }
    },

    "opening_stock": {
      "type": "grid",
      "label": "Opening Stock per Location",
      "grid": {
        "row_entity": "stock_ledger_opening",
        "columns": ["location_id", "qty", "rate", "as_of_date"]
      }
    },
    "reorder_level": { "type": "quantity", "label": "Reorder Level" },
    "reorder_qty": { "type": "quantity", "label": "Reorder Qty" },
    "max_stock": { "type": "quantity", "label": "Max Stock" },
    "lead_time_days": { "type": "integer", "label": "Lead Time (days)" },
    "shelf_life_days": {
      "type": "integer", "label": "Shelf Life (days)",
      "depends_on": [{ "when": "${is_batched} == true", "then": { "required": true, "visible": true } }, { "when": "${is_batched} == false", "then": { "visible": false } }]
    },
    "storage_location": { "type": "text", "label": "Storage Location", "validation": { "max_length": 60 } },
    "weight_g": { "type": "number", "label": "Weight (g)" },
    "dimensions": { "type": "text", "label": "L × W × H (cm)" },

    "tax_rate_id": { "type": "lookup", "label": "GST Rate", "lookup": { "entity": "tax_rates" }, "validation": { "required": true } },
    "cess_rate": { "type": "percent", "label": "Cess %" },
    "tax_exempt": { "type": "switch", "label": "Tax Exempt" },
    "reverse_charge": { "type": "switch", "label": "Reverse Charge Applicable" },

    "barcodes": {
      "type": "grid",
      "label": "Barcodes",
      "grid": {
        "row_entity": "item_barcodes",
        "columns": ["barcode", "symbology", "unit_id", "is_primary", "actions"],
        "min_rows": 0,
        "max_rows": 20
      }
    },
    "variants": { "type": "grid", "label": "Variants", "grid": { "row_entity": "item_variants", "columns": ["sku", "attribute_1", "attribute_2", "price", "barcode"] } },

    "margin_amount": { "type": "display", "label": "Margin", "computed": true },
    "margin_pct": { "type": "display", "label": "Margin %", "computed": true }
  },
  "computed": {
    "margin_amount": {
      "formula": "${sale_price} - ${purchase_price}",
      "depends_on": ["sale_price", "purchase_price"],
      "format": "currency"
    },
    "margin_pct": {
      "formula": "${purchase_price} > 0 ? (${sale_price} - ${purchase_price}) / ${purchase_price} * 100 : 0",
      "depends_on": ["sale_price", "purchase_price"],
      "format": "percent"
    }
  },
  "validation": {
    "cross_field": [
      { "id": "sale_below_min", "fields": ["sale_price", "min_sale_price"], "rule": "${sale_price} >= ${min_sale_price}", "message": { "i18n": "validation.sale_below_min" }, "severity": "warning" },
      { "id": "sale_below_cost", "fields": ["sale_price", "purchase_price"], "rule": "${sale_price} >= ${purchase_price}", "message": "Sale below cost", "severity": "warning" }
    ]
  },
  "actions": [
    { "id": "cancel", "label": { "i18n": "action.cancel" }, "variant": "ghost", "hotkey": "Escape", "on_click": "close" },
    { "id": "save", "label": { "i18n": "action.save" }, "variant": "primary", "hotkey": "Ctrl+S", "endpoint": "POST /v1/items", "on_success": "close_with_toast" },
    { "id": "save_and_new", "label": { "i18n": "action.save_and_new" }, "variant": "secondary", "hotkey": "Ctrl+Shift+S", "endpoint": "POST /v1/items", "on_success": "reset_with_toast" }
  ]
}
```

### 24.2 `customer.create_edit.json` (Outline)

Same shape, tabs: `general`, `billing`, `credit`, `pricing`, `loyalty`, `vehicles` (workshop), `notes`. Fields per SCR-CUS-02.

### 24.3 `vendor.create_edit.json`

Mirror of customer with `banking` tab (bank_account_no, ifsc, bank_name, upi_id).

### 24.4 `invoice.pos.json` (Special: the POS form)

Layout type `stack` with three sections:
- `header` — series, no, date, customer, place_of_supply, salesperson, reference_no
- `lines` — grid of invoice_lines (the EditableGrid)
- `summary` — totals (all computed), payments grid, notes

```json
{
  "form_id": "invoice.pos",
  "title": "Billing",
  "entity": "invoices",
  "layout": {
    "type": "stack",
    "sections": [
      {
        "id": "header",
        "columns": 4,
        "fields": ["series_id", "invoice_no", "invoice_date", "customer_id", "place_of_supply", "salesperson_id", "reference_no"]
      },
      { "id": "lines", "columns": 1, "fields": ["lines"] },
      { "id": "summary", "columns": 2, "fields": ["totals_panel", "payments"] },
      { "id": "footer", "columns": 1, "fields": ["notes"] }
    ]
  },
  "fields": {
    "series_id": { "type": "lookup", "label": "Series", "lookup": { "entity": "invoice_series", "filters": { "is_active": true } } },
    "invoice_no": { "type": "text", "label": "Invoice #", "ui": { "readonly_after_create": true }, "default": { "from_endpoint": "/v1/invoice-series/next" } },
    "invoice_date": { "type": "date", "label": "Date", "default": "today", "validation": { "max_date": "today" } },
    "customer_id": {
      "type": "lookup", "label": "Customer",
      "lookup": { "entity": "customers", "create_inline": true, "create_form_id": "customer.quick_create" }
    },
    "place_of_supply": { "type": "select", "label": "POS", "options_endpoint": "/v1/states", "default": { "from_field": "customer_id.state_code" } },
    "salesperson_id": { "type": "lookup", "label": "Salesperson", "lookup": { "entity": "users", "filters": { "is_salesperson": true } }, "default": "current_user" },
    "reference_no": { "type": "text", "label": "Reference / PO No." },

    "lines": {
      "type": "grid",
      "label": "Items",
      "grid": {
        "row_form_id": "invoice_line",
        "min_rows": 1,
        "max_rows": 200,
        "auto_add_on_enter": true,
        "summary_row": {
          "show": true,
          "fields": { "qty": "sum", "taxable_amt": "sum", "tax_amt": "sum", "total": "sum" }
        }
      }
    },

    "totals_panel": { "type": "display", "label": "Totals", "renderer": "InvoiceTotalsPanel" },
    "payments": {
      "type": "grid",
      "label": "Payments",
      "grid": { "row_form_id": "payment_line", "min_rows": 0, "max_rows": 5 }
    },
    "notes": { "type": "textarea", "label": "Notes", "rows": 2 }
  },
  "computed": {
    "subtotal": { "formula": "sum(${lines}.taxable_amt)" },
    "discount_total": { "formula": "sum(${lines}.discount_amt)" },
    "cgst_total": { "formula": "sum(${lines}.cgst_amt)" },
    "sgst_total": { "formula": "sum(${lines}.sgst_amt)" },
    "igst_total": { "formula": "sum(${lines}.igst_amt)" },
    "grand_total": { "formula": "${subtotal} + ${cgst_total} + ${sgst_total} + ${igst_total} + ${round_off}" },
    "amount_paid": { "formula": "sum(${payments}.amount)" },
    "balance_due": { "formula": "${grand_total} - ${amount_paid}" }
  },
  "actions": [
    { "id": "hold", "label": "Hold", "hotkey": "F9", "endpoint": "POST /v1/invoices/drafts" },
    { "id": "save", "label": "Save", "hotkey": "Ctrl+S", "endpoint": "POST /v1/invoices" },
    { "id": "save_and_print", "label": "Save & Print", "hotkey": "F12", "variant": "primary", "endpoint": "POST /v1/invoices", "on_success": ["print", "reset"] }
  ]
}
```

### 24.5 `invoice_line.json` (Sub-form for grid rows)

```json
{
  "form_id": "invoice_line",
  "fields": {
    "item_id": { "type": "lookup", "lookup": { "entity": "items", "barcode": true }, "validation": { "required": true } },
    "description": { "type": "text", "default": { "from_field": "item_id.name" } },
    "hsn_code": { "type": "text", "default": { "from_field": "item_id.hsn_code" }, "ui": { "readonly": true } },
    "qty": { "type": "quantity", "default": 1, "validation": { "required": true, "min": 0.001 } },
    "unit_id": { "type": "lookup", "lookup": { "entity": "units", "filters": { "item_id": "${item_id}" } }, "default": { "from_field": "item_id.primary_unit_id" } },
    "rate": { "type": "currency", "default": { "from_field": "item_id.sale_price" }, "validation": { "required": true } },
    "discount_pct": { "type": "percent", "default": 0 },
    "discount_amt": { "type": "currency", "default": 0 },
    "taxable_amt": { "type": "display", "computed": true },
    "tax_rate_id": { "type": "lookup", "lookup": { "entity": "tax_rates" }, "default": { "from_field": "item_id.tax_rate_id" } },
    "cgst_amt": { "type": "display", "computed": true },
    "sgst_amt": { "type": "display", "computed": true },
    "igst_amt": { "type": "display", "computed": true },
    "total": { "type": "display", "computed": true },
    "batch_id": { "type": "lookup", "lookup": { "entity": "batches", "filters": { "item_id": "${item_id}" } }, "depends_on": [{ "when": "${item_id.is_batched} == true", "then": { "visible": true, "required": true } }] }
  },
  "computed": {
    "taxable_amt": { "formula": "${qty} * ${rate} - ${discount_amt}" },
    "cgst_amt": { "formula": "${invoice.is_intra_state} ? ${taxable_amt} * ${tax_rate_id.cgst_rate} / 100 : 0" },
    "sgst_amt": { "formula": "${invoice.is_intra_state} ? ${taxable_amt} * ${tax_rate_id.sgst_rate} / 100 : 0" },
    "igst_amt": { "formula": "!${invoice.is_intra_state} ? ${taxable_amt} * ${tax_rate_id.igst_rate} / 100 : 0" },
    "total": { "formula": "${taxable_amt} + ${cgst_amt} + ${sgst_amt} + ${igst_amt}" }
  }
}
```

### 24.6 Other Form IDs

The same pattern produces:

| `form_id` | Maps to Screen |
|-----------|----------------|
| `purchase_invoice.create_edit` | SCR-PUR-01 |
| `purchase_order.create_edit` | SCR-PUR-02 |
| `credit_note.create_edit` | SCR-SAL-03 |
| `debit_note.create_edit` | SCR-PUR-03 |
| `payment.create_edit` | SCR-PAY-01 |
| `expense.create_edit` | SCR-EXP-01 |
| `stock_adjustment.create_edit` | SCR-STK-02 |
| `stock_transfer.create_edit` | SCR-STK-03 |
| `job_card.create_edit` | SCR-JOB-02 |
| `bom.create_edit` | SCR-MFG-01 |
| `production_order.create_edit` | SCR-MFG-02 |
| `user.create_edit` | SCR-USR-01 |
| `vehicle.create_edit` | (workshop master) |
| `settings.organization` | SCR-SET-01 §1 |
| `settings.tax_rate` | SCR-SET-01 §7 |
| `settings.invoice_series` | SCR-SET-01 §5 |
| `settings.bank_account` | SCR-SET-01 §12 |
| `onboarding.step1_org` | SCR-AUTH-02 step 1 |
| `onboarding.step2_branch` | SCR-AUTH-02 step 2 |
| ...etc | one per screen |

All follow the same shape; full schemas live in `src/ui/schemas/{form_id}.json`.

## 25. Form Authoring Workflow

### 25.1 Developer Flow

1. New entity is needed.
2. Developer writes `{entity}.create_edit.json` in `src/ui/schemas/`.
3. Schema is type-checked via JSON schema metaschema (`counter-form/v1.schema.json`).
4. Run `pnpm gen:forms` — generates TypeScript types + Zod validators from schemas.
5. Mount form via `<FormRenderer formId="entity.create_edit" />` or by routing.
6. Add i18n keys to `locales/en/forms.json` (and other languages).

### 25.2 Admin Flow (no-code)

Settings → Forms → pick a form → visual editor:
- Drag fields to reorder within sections.
- Add/remove fields from a palette of allowed fields per entity.
- Edit labels and hints inline.
- Toggle visibility / required.
- Cannot change field types (data integrity) — those are dev-only.
- Saving creates a new form version stored per org (overlays the base schema).

### 25.3 Schema Validation

Every saved form goes through:
1. JSON-schema metaschema validation.
2. Logical validation: all referenced field_ids exist; computed formulas reference existing fields; no circular dependencies in `depends_on` chains.
3. Preview render with sample data — must not error.
4. Diff against previous version logged to audit log.

### 25.4 LLM-Assisted Form Editing

Because forms are JSON, an LLM agent can be safely scoped to form modifications. Example prompts the assistant accepts in Settings → Forms:
- "Add a custom field 'Lot number' to the Item form's Stock tab, required when item is batched."
- "Move the Notes field to a new section called Internal."
- "Make the Tax Rate field readonly for Cashier role."

The agent proposes a JSON diff for human approval before applying. Always reversible from version history.

---

## 26. Putting It Together — End-to-End Example

Consider: **"Add Lot Number field to items, required when batched, visible only to Stock Keeper and above."**

1. **Settings → Forms → Item Form → Edit.**
2. Visual editor adds field, generates this JSON fragment:

```json
{
  "lot_number": {
    "type": "text",
    "label": { "i18n": "field.item.lot_number" },
    "validation": { "max_length": 40 },
    "depends_on": [
      { "when": "${is_batched} == true", "then": { "required": true } }
    ],
    "permissions": { "view": ["stock.manage"] }
  }
}
```

3. Field placed in Stock tab → identity section.
4. i18n key added with default English; other languages flagged for translation.
5. Renderer reloads → new field visible immediately to Stock Keeper, hidden from Cashier.
6. No application restart, no deploy, no DB migration (uses `custom_fields` JSONB column on items).
7. Audit log records who added the field.

**This is the power of the system:** the entire UI is data, and the data is editable.

---

*End of UI System & Form Builder specification.*
