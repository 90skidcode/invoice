# CLAUDE.md

> **You are working on Counter — a local-first, multi-device billing & inventory platform for Indian SMBs (retail, workshop, manufacturing).** This document is the contract between you and the codebase. Treat it as the source of truth. When in doubt, re-read the relevant section before writing code.

---

## 0. How to Use This Document

- **Read sections 1–3 every session before you start work.** They contain the rules that, if broken, cause data corruption or production outages.
- **Sections 4 onwards are reference material** — consult the relevant section when the work touches it.
- **If you find yourself wanting to break a rule, stop and ask the human.** Don't justify it to yourself.
- **The full project specs live in:**
  - `Counter_BRD_FSD.md` — business requirements + FSD + DB schema
  - `Counter_FSD_Extended.md` — screen-level specs at POS depth
  - `Counter_API_Spec.md` — REST + WebSocket API contract
  - `Counter_Invoice_Templates.md` — invoice rendering (HTML + ESC/POS)
  - `Counter_UI_System.md` — component library + JSON form builder
  - These docs are authoritative. **If your code disagrees with the spec, fix the code.** If the spec is wrong, raise it with the human — don't quietly drift.

---

## 1. Sacred Rules (Never Break These)

These are the rules that, if violated, cause silent data corruption, financial errors, or compliance failures. They are non-negotiable.

### 1.1 Money is never a float

**Always use string-encoded decimals (`"1234.56"`) in transport (API, JSON, payloads). Always use `NUMERIC(14,2)` in Postgres. Always use a decimal library (`decimal.js` in Node, never `Number`) for arithmetic.**

```ts
// ❌ NEVER
const total = qty * rate;
const tax = total * 0.18;

// ✅ ALWAYS
import Decimal from 'decimal.js';
const total = new Decimal(qty).times(rate);
const tax = total.times('0.18');
const grandTotal = total.plus(tax).toFixed(2);  // returns string "1180.00"
```

Floats lose pennies. We've seen this kill businesses. **No exceptions.**

### 1.2 Stock is never a column

**`items.on_hand` does not exist. It must not exist. Don't add it.**

Current stock is **always** derived from `stock_ledger`:

```sql
SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0) AS current_stock
FROM stock_ledger
WHERE org_id = $1 AND item_id = $2 AND location_id = $3 AND deleted_at IS NULL;
```

For performance, `stock_ledger.balance_qty` (running balance) is denormalized **within** the ledger — not in `items`. Every write to `stock_ledger` updates the running balance in the same transaction.

If you're tempted to cache current stock on `items` for "performance," talk to the human first. Almost always the right answer is to add an index or use the running balance column.

### 1.3 Stock ledger is append-only

`stock_ledger` rows are **INSERT only**. Never `UPDATE`. Never `DELETE`. Never soft-delete with `deleted_at`.

To "correct" a ledger entry, write a compensating entry (positive or negative qty) with a clear `txn_type` and `note`. The original entry stays forever.

There is a database-level trigger that rejects UPDATE and DELETE on this table. If you find yourself trying to defeat it, you're doing something wrong.

### 1.4 Every write to a transactional table goes in a transaction

Sales, purchases, returns, payments, adjustments — none of these are a single INSERT. They write to multiple tables (header + lines + stock_ledger + payment_allocations + audit_log). **All of those writes are in one DB transaction.**

```ts
// ✅ Required pattern
await db.transaction(async (trx) => {
  const invoice = await trx.insert(invoices).values(...).returning();
  await trx.insert(invoice_lines).values(...);
  await trx.insert(stock_ledger).values(...);
  await trx.insert(payments).values(...);
  await trx.insert(payment_allocations).values(...);
  await trx.insert(audit_log).values(...);
  return invoice;
});
```

If a transaction can fail partway, you must roll back fully. There is no "best effort" save.

### 1.5 Everything is multi-tenant — always filter by `org_id`

Every query reads or writes within an org. **`org_id` is in every WHERE clause, every INSERT.**

```ts
// ❌ NEVER
const items = await db.select().from(items).where(eq(items.id, itemId));

// ✅ ALWAYS
const items = await db.select().from(items)
  .where(and(eq(items.id, itemId), eq(items.org_id, ctx.org_id)));
```

We use a Drizzle middleware that injects `org_id` automatically on most queries, but you must verify it's applied. **A missing `org_id` filter is a data leak across customers.** This is a P0 bug.

### 1.6 Soft delete only

No `DELETE FROM ...` against business tables. Set `deleted_at = now()` and `deleted_by = user_id`. Queries always include `WHERE deleted_at IS NULL` (the Drizzle helper does this automatically).

Exceptions: `invoice_drafts` (transient), `notifications` (after retention), `sync_log` (after retention) — these have hard cleanup jobs that run separately.

### 1.7 Period locks must be respected

Before any INSERT or UPDATE on a transactional table with a `txn_date` field, check `period_locks`. If `txn_date <= locks.lock_through_date`, reject with `PERIOD_LOCKED`.

There's a DB trigger that enforces this for the canonical transaction tables. Don't bypass it.

### 1.8 Audit log gets every change

Every INSERT, UPDATE, void, delete on a business entity writes a corresponding row to `audit_log`. Drizzle hooks do this for the standard CRUD; if you're using raw SQL or bypassing the hook, you write the audit row manually.

```ts
await trx.insert(audit_log).values({
  org_id, at: new Date(), user_id, device_id, ip,
  entity_table: 'invoices', entity_id: invoice.id,
  action: 'create', before_json: null, after_json: invoice,
});
```

### 1.9 Tax rates are versioned — never hardcode

Never write `* 0.18` or `* 0.05` in code. Always look up the active tax rate for the invoice's date:

```ts
const taxRate = await getTaxRateOn(invoice.invoice_date, item.tax_rate_id);
```

A historical invoice from when GST was different must recompute with the rate that was active on its date, not today's rate.

### 1.10 UUID v7 for all IDs

All primary keys are UUID v7. Clients generate them locally so offline-created records have a stable ID before sync.

```ts
import { uuidv7 } from 'uuidv7';
const newInvoiceId = uuidv7();
```

Never use `gen_random_uuid()` in DB defaults for tables that clients can write to. UUID v7 is time-ordered, so it indexes well and shows creation order naturally.

### 1.11 Invoice numbers are gap-free per series per FY

Invoice numbers come from a server-side sequence inside `invoice_series.next_number`, locked with `SELECT ... FOR UPDATE` inside the save transaction.

Offline devices reserve a range of 50 numbers per series. Conflicts on sync are renumbered server-side and surfaced to the operator. You never invent an invoice number yourself.

### 1.12 Don't break offline

Counter must work fully offline. Every feature must consider:
- Will this work with no internet?
- Will this work with intermittent sync?
- Can the client generate this ID locally?
- Will this conflict on sync?

If your feature requires the server to respond synchronously to be usable, redesign it.

---

## 2. The Stack

### 2.1 Approved Dependencies

| Layer | Library | Notes |
|-------|---------|-------|
| Frontend framework | React 18 + TypeScript | Strict mode |
| Desktop wrapper | Tauri 2 | Not Electron |
| Mobile wrapper | Capacitor | Same React codebase |
| Styling | Tailwind CSS | Via CSS variables for theming |
| Component base | shadcn/ui + Radix UI | Copy-in components, owned in our repo |
| Icons | lucide-react | Single-stroke style |
| Forms | react-hook-form + Zod | Always paired |
| Tables | @tanstack/react-table v8 | Headless, we render |
| Dates | date-fns | NEVER moment.js |
| Date picker | react-day-picker | Built on date-fns |
| Decimal math | decimal.js | For all money/quantity arithmetic |
| Local search | fuse.js | Client-side fuzzy search |
| ID generation | uuidv7 | UUID v7 only |
| Local DB | better-sqlite3 (Node), bun:sqlite (if Bun) | Synchronous API |
| Backend framework | Fastify | Not Express |
| ORM | Drizzle | Not Prisma, not TypeORM |
| Server DB | PostgreSQL 16 | |
| Cache / queues | Redis 7 | BullMQ for jobs |
| WebSocket | ws (Node) | Not socket.io |
| Validation | Zod | Same schemas client+server |
| Auth | jose (JWT) | RS256 |
| Hashing | argon2 | Not bcrypt |
| QR codes | qrcode | Server-side SVG generation |
| Barcodes | bwip-js | Multi-symbology |
| PDF rendering | puppeteer | Server-side, headless Chromium |
| Thermal printing | node-thermal-printer | ESC/POS abstraction |
| Logging | pino | Structured JSON logs |
| Testing | vitest | Not jest |
| E2E testing | Playwright | |
| Linting | ESLint flat config + Biome | Biome for format/sort |
| Package manager | pnpm | Not npm, not yarn |
| Node version | 22 LTS | Match `engines` in package.json |

### 2.2 Banned Dependencies

Do not introduce any of these without explicit approval:

| Banned | Use Instead | Reason |
|--------|-------------|--------|
| moment, dayjs | date-fns | Frozen / bigger / inconsistent |
| lodash | native ES, or specific imports | Tree-shake hostile |
| axios | native fetch | Smaller, modern |
| express | Fastify | Slower, weaker validation |
| jest | vitest | Vite native, faster |
| prisma | Drizzle | Heavier, slower migrations |
| styled-components, emotion | Tailwind | We're committed |
| material-ui, antd, chakra | shadcn/ui | Brand lock-in |
| bcrypt, bcryptjs | argon2 | Outdated KDF |
| any "starter kit" boilerplate | — | Hand-roll, stay lean |

If you need something not on the approved list, **ask first**. Don't `pnpm add` blindly.

### 2.3 Versions Are Pinned

Use exact versions in `package.json` (no `^` or `~`). Renovate bot opens upgrade PRs; humans review them.

---

## 3. Repository Structure

```
counter/
├── apps/
│   ├── desktop/          # Tauri shell
│   ├── mobile/           # Capacitor shell
│   ├── web/              # Same React app — shared
│   └── api/              # Fastify backend
├── packages/
│   ├── ui/               # Component library + form renderer
│   ├── schemas/          # Zod schemas, shared client+server
│   ├── db/               # Drizzle schemas + migrations
│   ├── sync/             # Sync protocol implementation
│   ├── printer/          # ESC/POS + HTML print
│   ├── tax/              # GST calculation, validation
│   ├── i18n/             # Translation strings
│   └── utils/            # Pure helpers (money, dates, ids)
├── docs/                 # Specs (BRD, FSD, API, etc.)
├── scripts/              # Build, codegen, migration helpers
└── tests/                # E2E tests
```

Rules:
- **`packages/utils` has no internal dependencies.** It's pure functions only.
- **`packages/schemas` depends only on `utils`.** Both client and server import from here.
- **`packages/db` is server-only.** Never imported from `apps/web` or `apps/desktop`.
- **Cross-app shared code goes in a package, not copy-pasted.**
- **Apps don't import from each other.** Only through packages.

---

## 4. TypeScript Rules

### 4.1 Strict Mode Always

`tsconfig.json` has:
```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noPropertyAccessFromIndexSignature": true,
  "exactOptionalPropertyTypes": true
}
```

If your code doesn't compile cleanly under these, fix it. Don't disable rules.

### 4.2 `any` is Forbidden

There is no acceptable use of `any` in this codebase. If you don't know the type, use `unknown` and narrow it. If something is genuinely untyped at a boundary, write a Zod parser.

```ts
// ❌ NEVER
const data: any = JSON.parse(input);

// ✅ Always
const data = MySchema.parse(JSON.parse(input));
```

ESLint rule `@typescript-eslint/no-explicit-any` is set to `error`.

### 4.3 Use Branded Types for IDs

To prevent passing a `customer_id` where an `item_id` is expected:

```ts
type ItemId = string & { __brand: 'ItemId' };
type CustomerId = string & { __brand: 'CustomerId' };

function getItem(id: ItemId) { ... }   // can't accidentally pass CustomerId
```

Brand them with helpers in `packages/schemas/ids.ts`.

### 4.4 Discriminated Unions for State

```ts
// ✅ Result types
type SaveResult =
  | { status: 'success'; invoice: Invoice }
  | { status: 'conflict'; serverVersion: Invoice }
  | { status: 'error'; code: string; message: string };
```

Not optionals everywhere — discriminated unions force you to handle each case.

### 4.5 Naming

- **Types and interfaces:** `PascalCase` (`Invoice`, `CustomerLedgerEntry`).
- **Variables, functions:** `camelCase`.
- **Constants:** `UPPER_SNAKE_CASE` (`MAX_LINE_ITEMS = 200`).
- **Files:** `kebab-case` (`invoice-line.ts`, `customer-ledger.tsx`).
- **DB tables and columns:** `snake_case` (matches Postgres convention).
- **API endpoints:** `kebab-case` (`/credit-notes`, `/stock-adjustments`).
- **Form IDs in JSON:** `dot.case` (`invoice.create_edit`, `item.create_edit`).
- **i18n keys:** `dot.case` (`field.item.name`, `validation.required`).

Don't mix conventions. If you see a mismatch, fix it.

### 4.6 Avoid Abbreviations

`customer` not `cust`. `invoice` not `inv`. `quantity` not `qty` — except where it's an established DB column name and changing would break things (`qty_in`, `qty_out` stay as-is).

Exception: well-known industry terms (GST, HSN, SKU, PO, GRN, UPI, BOM, FG, IRN) stay abbreviated.

---

## 5. Database Rules

### 5.1 Schema Changes Go Through Migrations

Never alter the live schema by hand. Always:

```bash
pnpm db:migrate:create add_lot_number_to_items
```

Edit the generated migration. Run `pnpm db:migrate:up` to apply locally. Commit migration files. They run automatically in CI on deploy.

Migrations are **append-only**. Never edit a migration that's been merged to main. Write a new migration that supersedes it.

### 5.2 Every Table Has Standard Columns

```sql
id           UUID PRIMARY KEY,
org_id       UUID NOT NULL REFERENCES organizations(id),
created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
created_by   UUID NOT NULL REFERENCES users(id),
updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_by   UUID NOT NULL REFERENCES users(id),
deleted_at   TIMESTAMPTZ,
deleted_by   UUID,
row_version  BIGINT NOT NULL DEFAULT 1,
sync_status  SMALLINT NOT NULL DEFAULT 0
```

The Drizzle helper `baseColumns()` produces these. Use it.

Exceptions: `stock_ledger`, `audit_log`, `sync_log` (append-only, no `updated_*` / `deleted_*`).

### 5.3 Indexes

- Every FK column gets an index. Drizzle does this automatically — verify.
- Every column used in a WHERE clause of a report query gets an index.
- For date-ranged reports, the index is `(org_id, date_column DESC)`.
- For text search, `GIN` index with `gin_trgm_ops` on `name` columns.
- After adding a feature, look at `pg_stat_statements` in staging — if your new query is in the top slow queries, add an index before merging.

### 5.4 Don't Write Raw SQL Without a Reason

Drizzle handles 95% of queries cleanly. Reach for raw SQL only when:
- Complex window functions / CTEs Drizzle can't express.
- Performance-critical report queries with hand-tuned plans.
- Migrations.

When you do write raw SQL, **use parameterized queries**. No string interpolation. Ever.

```ts
// ❌ NEVER
await db.execute(`SELECT * FROM items WHERE name = '${userInput}'`);

// ✅ Always
await db.execute(sql`SELECT * FROM items WHERE name = ${userInput}`);
```

SQL injection is not a theoretical risk in a multi-tenant SaaS.

### 5.5 Optimistic Concurrency

Updates check `row_version`:

```ts
const result = await db.update(items)
  .set({ ...data, row_version: sql`row_version + 1`, updated_at: new Date() })
  .where(and(
    eq(items.id, id),
    eq(items.org_id, ctx.org_id),
    eq(items.row_version, expectedVersion)
  ))
  .returning();

if (result.length === 0) throw new ConflictError('Row was modified by another user');
```

The API layer maps this to 409 with the current state so the client can re-fetch and merge.

### 5.6 Use Postgres Features

- `JSONB` for flexible attributes (`items.custom_fields`, `settings.value`).
- `NUMERIC` for money/quantities, never `FLOAT` or `DOUBLE`.
- `TIMESTAMPTZ` for all timestamps. Never `TIMESTAMP` without TZ. Never `DATE` for moments.
- Partial indexes for filtered queries (`WHERE deleted_at IS NULL`).
- `GENERATED ALWAYS AS ... STORED` for simple computed columns.

### 5.7 Migrations Must Be Reversible (where reasonable)

Every migration has `up` and `down`. Down migrations exist for emergencies — they're tested in staging but rarely run in prod. Adding a NOT NULL column to a big table is a multi-step migration (add nullable, backfill, set NOT NULL).

---

## 6. Backend / Node.js Rules

### 6.1 Every Request Is Scoped to a Context

```ts
type RequestContext = {
  user_id: UserId;
  org_id: OrgId;
  device_id: DeviceId;
  branch_id?: BranchId;
  permissions: Set<string>;
  request_id: string;
  ip: string;
};
```

Built from JWT + headers in a Fastify hook. **Available on every route handler.** Pass `ctx` into every service function. Never reach for it via globals.

### 6.2 Layered Architecture

```
Route (Fastify) → Service (business logic) → Repository (DB)
```

- **Routes**: parse + validate input via Zod, call service, format response.
- **Services**: business logic, transactions, calls to other services or repositories.
- **Repositories**: just CRUD on tables. No business logic.

Don't put SQL in routes. Don't put HTTP concerns in services.

### 6.3 Validate Input With Zod

```ts
const CreateInvoiceInput = z.object({
  client_id: z.string().uuid(),
  series_id: z.string().uuid(),
  invoice_date: z.string().date(),
  customer_id: z.string().uuid().nullable(),
  // ...
});

fastify.post('/v1/invoices', async (req, reply) => {
  const input = CreateInvoiceInput.parse(req.body);
  const invoice = await invoiceService.create(ctx, input);
  return { ok: true, data: invoice };
});
```

If the parse throws, Fastify error handler maps to `400 VALIDATION_FAILED`. **Never trust unvalidated input.**

### 6.4 Error Handling

Use typed error classes that map to HTTP codes:

```ts
class BusinessError extends Error { code = 'BUSINESS_RULE_VIOLATION'; status = 400; }
class ConflictError extends Error { code = 'CONFLICT'; status = 409; }
class NotFoundError extends Error { code = 'NOT_FOUND'; status = 404; }
class PermissionError extends Error { code = 'FORBIDDEN'; status = 403; }
class PeriodLockedError extends Error { code = 'PERIOD_LOCKED'; status = 423; }
```

The global error handler converts these to the standard envelope (see `Counter_API_Spec.md` §1.4–1.5). **Never `res.send(500)` with a raw error message** — leaks stack traces.

### 6.5 Don't Swallow Errors

```ts
// ❌ NEVER
try { await something(); } catch (e) {}

// ❌ NEVER
try { await something(); } catch (e) { console.log(e); }

// ✅ Either rethrow, or handle explicitly
try {
  await something();
} catch (e) {
  if (e instanceof ConflictError) {
    return { retried: true };
  }
  throw e;  // re-throw anything you don't recognize
}
```

### 6.6 Async / Await Only

- No `.then()` chains.
- No callbacks except in low-level I/O wrappers.
- Promise.all for parallel, Promise.allSettled when you need partial success info.
- No fire-and-forget — every promise is awaited or explicitly handed to a queue/worker.

### 6.7 Idempotency on Writes

Every POST that creates a row accepts `Idempotency-Key`. The middleware caches `(org_id, idempotency_key, endpoint) → response` for 24h.

When writing a new endpoint, register it in the idempotency-aware route registry (or add the `idempotent: true` route option).

### 6.8 Logging

Use `pino` with structured fields:

```ts
ctx.log.info({ invoice_id, customer_id, duration_ms }, 'invoice created');
ctx.log.error({ err, invoice_id }, 'invoice save failed');
```

- **Never log PII** (full phone numbers, full email addresses, GSTINs, full addresses). Use `phone_last_4` etc.
- **Never log auth tokens, PINs, credit card refs, UPI VPAs.** PII filter middleware redacts these but don't rely on it.
- `console.log` is banned in `apps/api`. ESLint rule enforces.
- Log levels: `trace` (verbose dev), `debug` (dev), `info` (normal), `warn` (recoverable issue), `error` (something broke), `fatal` (crashing now).

### 6.9 Background Jobs

Heavy or slow work goes to BullMQ:

```ts
// In an endpoint
await jobQueue.add('generate-report', { orgId, reportType, params });
return { ok: true, data: { job_id: jobId } };

// In a worker process
jobQueue.process('generate-report', async (job) => { ... });
```

Endpoints that wait > 1 sec for a synchronous result are a code smell. Make them async and return a job ID; client polls `GET /v1/jobs/{id}`.

### 6.10 No Synchronous I/O

`fs.readFileSync`, `crypto.pbkdf2Sync`, `child_process.execSync` — all banned in request handlers. They block the event loop. Use the async variants.

Exception: small one-time reads at boot.

---

## 7. Frontend / React Rules

### 7.1 Functional Components Only

No class components. Hooks for state.

### 7.2 Server State vs Client State

- **Server state** (data from API) → TanStack Query. Always.
- **Client state** (UI state, form drafts) → `useState`, `useReducer`, or Zustand for app-wide UI state.
- **Form state** → React Hook Form.

Don't put server data in `useState`. Don't put UI state in TanStack Query.

### 7.3 No Inline Styles

```tsx
// ❌ NEVER
<div style={{ padding: 16, color: 'red' }}>

// ✅ Always Tailwind
<div className="p-4 text-red-600">
```

Exception: dynamic values you genuinely can't express in Tailwind (e.g. `style={{ width: progress + '%' }}`). Even then, prefer `className` with CSS variable.

### 7.4 No One-Off CSS Files

Component-scoped styles via Tailwind utility classes. If a pattern repeats, extract a component, not a CSS class.

### 7.5 Forms Are JSON Schemas

For any standard CRUD form (Item, Customer, Vendor, Invoice, etc.), **don't write a bespoke React form.** Define a JSON schema in `packages/ui/schemas/` and render with `<FormRenderer formId="..." />`.

You write a custom form **only** when:
- It's a non-standard screen (POS, dashboard widget, custom report builder).
- The interaction is fundamentally different from data entry (drag-drop, canvas).

See `Counter_UI_System.md` Part B for the form schema spec.

### 7.6 Use Library Components, Not One-Offs

When you need an input, a select, a button, a table — **import from `@counter/ui`**. Don't write a one-off `<MyButton>` because the standard one "doesn't quite fit."

If a component doesn't meet your needs:
1. First, check if it does and you missed a prop.
2. Then, see if a prop should be added to the shared component.
3. Only then, consider a new variant — but discuss with the human first.

### 7.7 Accessibility Is Mandatory

- Every interactive element keyboard-reachable.
- Every form input has a `<Label>` (or `aria-label`).
- Icon-only buttons have `aria-label`.
- Modals trap focus, restore on close (Radix does this — use it).
- Color is never the sole indicator (pair with icon/text).
- Test with keyboard only before merging UI work.

### 7.8 Loading and Empty States

Every screen that fetches data has:
- Loading state (skeleton, not spinner where possible).
- Empty state (helpful message + CTA, not blank screen).
- Error state (clear message, retry option).

Don't ship a screen that shows blank during loading.

### 7.9 Hotkeys

Use the central hotkey registry — don't add `useEffect` + `addEventListener` directly.

```tsx
useHotkey('Ctrl+S', () => saveInvoice());
useHotkey('F12', () => saveAndPrint(), { scope: 'pos' });
```

Hotkeys are scoped (global / page / modal) so they don't conflict across views.

### 7.10 i18n All Strings

User-facing strings come from i18n:

```tsx
// ❌ NEVER
<Button>Save Invoice</Button>

// ✅ Always
<Button>{t('action.save_invoice')}</Button>
```

New strings go in `packages/i18n/en/{module}.json`. Translation to other languages happens later — leave English as fallback.

Internal admin tools and dev-only screens can use literal strings.

### 7.11 Numbers and Dates Through Formatters

```tsx
// ❌ NEVER
<span>₹ {amount.toFixed(2)}</span>
<span>{new Date(date).toLocaleDateString()}</span>

// ✅ Always
<PriceDisplay value={amount} />
<DateDisplay value={date} />
```

These honor the user's locale and org settings. Direct formatting in JSX is a bug.

---

## 8. Form Schema Rules

When writing or editing a form JSON schema:

### 8.1 Use i18n References for All Strings

```json
{
  "label": { "i18n": "field.item.name" }
}
```

Not literal strings. Even in development.

### 8.2 Set Validation at the Right Level

- **Field-level validation** (required, max_length, pattern) → on the field.
- **Cross-field validation** (mfg < expiry) → in `validation.cross_field`.
- **Server-only validation** (uniqueness, period lock) → in `validation.on_submit` with an endpoint.
- **Business rules that don't have UI semantics** (e.g. stock availability) → server-side only, returned as error.

### 8.3 Conditional Logic Goes in `depends_on`

Not in custom JavaScript. If you can't express it in the `depends_on` expression language, the form needs a redesign — or you're writing a custom screen, not a JSON form.

### 8.4 Computed Fields Are Display-Only

Users don't edit computed fields. The renderer shows them as `type: "display"`. The server recomputes them on save — never trust the client's computed value.

### 8.5 Bump the Version on Breaking Changes

If you change a field's type, remove a field, or change validation that would reject previously valid data — bump the major version and add a migration. See `Counter_UI_System.md` §22.

### 8.6 Permissions Are Declared, Not Imperative

```json
{
  "purchase_price": {
    "permissions": { "view": ["item.view_cost"], "edit": ["item.edit_cost"] }
  }
}
```

Not `{ visible: user.role === 'owner' }` in code. The renderer checks the user's permission set against the declaration.

---

## 9. Sync & Offline Rules

### 9.1 Client Generates IDs

Don't `await fetch` to get an ID before writing locally. Generate UUID v7, write to local SQLite, queue sync. The ID is final.

### 9.2 Local Write First, Sync Second

Save to local SQLite. **Then** queue the change for sync. UI updates immediately from local. Sync happens in the background.

```ts
await localDb.transaction(async (trx) => {
  await trx.insert(invoices).values(invoice);
  await trx.insert(invoice_lines).values(lines);
  await trx.insert(stock_ledger).values(ledgerEntries);
  await trx.insert(sync_outbox).values({ entity: 'invoice', entity_id: invoice.id, op: 'create' });
});
```

If you make the user wait for the network, you've broken the offline-first promise.

### 9.3 Invoice Numbers Are Reserved, Not Generated

When offline, the client uses pre-reserved numbers from a range. When online, the server hands them out atomically. Client never "guesses" a number.

### 9.4 Conflict Resolution Is Server-Authoritative

If two devices edit the same row, the server's resolution wins. Client receives the resolved state via WebSocket and updates local DB. Surface conflicts to the user only when manual resolution is needed.

### 9.5 The Stock Ledger Never Conflicts

Because it's append-only. Different devices writing entries for the same item just produce different rows. The running balance is recomputed from the order they land in.

### 9.6 Don't Block the UI Waiting for Sync

The sync status indicator (top bar) tells the user when sync is behind. Operations don't block on "wait for sync." A user can keep billing all day with no network and reconcile when WiFi returns.

---

## 10. Tax, Money, Numbers, Dates

### 10.1 Money

- Storage: `NUMERIC(14,2)` in Postgres, string in JSON.
- Math: `decimal.js`.
- Display: `<PriceDisplay>`.
- Currency: INR only at launch — but never assume INR in code that touches money. Read from org settings.

### 10.2 Quantities

- Storage: `NUMERIC(14,3)`.
- Math: `decimal.js`.
- Display: `<QuantityDisplay value={qty} unit={unit} />` — handles unit conversion.

### 10.3 Tax Calculation

Use `packages/tax`:

```ts
import { computeLineTax } from '@counter/tax';

const result = computeLineTax({
  qty,
  rate,
  discountAmt,
  taxRateId,
  invoiceDate,            // for versioned rate lookup
  placeOfSupply,
  branchStateCode,
  priceIncludesTax,
});
// returns { taxable_amt, cgst_amt, sgst_amt, igst_amt, cess_amt, total }
```

Don't re-implement tax math anywhere else. The package has every edge case (composition scheme, reverse charge, tax-inclusive prices, mid-year rate changes).

### 10.4 Dates and Times

- Storage: `TIMESTAMPTZ` for moments, `DATE` for calendar dates only.
- Always store in UTC, render in org timezone.
- date-fns for math; date-fns-tz for timezone shifts.
- Never `new Date(string)` — use `parseISO` from date-fns.
- "Today" is org-timezone-dependent — use `getOrgToday(ctx)`.

### 10.5 Indian Number Formatting

Use `formatIndianNumber()` from `@counter/utils`. `1234567.89` → `12,34,567.89`.

---

## 11. Security Rules

### 11.1 Auth

- JWTs signed with RS256.
- Access tokens 15 min, refresh tokens 30 days, rotating.
- PINs hashed with argon2id.
- Failed login attempts tracked; lockout after 5.
- 2FA via TOTP; recovery codes stored hashed.

### 11.2 PII / Sensitive Data

- Never log full PII (see §6.8).
- GSTIN, PAN, full phone, full address are PII.
- Stripe / Razorpay / UPI VPAs are sensitive — encrypt at rest in the DB.
- Backups are encrypted at rest (AES-256-GCM).

### 11.3 SQL Injection

Parameterized queries always. ESLint rule flags template-string-built SQL.

### 11.4 XSS

React escapes by default. **Never use `dangerouslySetInnerHTML`** unless rendering trusted, pre-sanitized HTML (invoice templates from `print_templates` — and even there, the template engine escapes user data, only HTML structure comes from the template).

### 11.5 CSRF

API is bearer-token. CSRF not applicable to API endpoints. For the small admin web UI: double-submit cookie pattern.

### 11.6 Rate Limiting

Every endpoint has a rate limit. Default 600/min per user, 60/min per IP for unauthenticated. Auth endpoints are stricter (5/min per identifier). Fastify rate-limit plugin.

### 11.7 Don't Reinvent Crypto

- Use established libraries (jose, argon2, libsodium-bindings).
- No "rolling our own" anything.
- If you need crypto and don't know what to use, ask.

### 11.8 Secrets

- Never in code, never in git.
- Env vars in production via secret manager (AWS Secrets Manager / Doppler).
- `.env.local` for dev — gitignored.
- Rotate quarterly.

---

## 12. Testing Rules

### 12.1 What Must Have Tests

- **Every tax calculation function** — exhaustive cases for intra/inter, inclusive/exclusive, mid-year rate change, composition.
- **Every money arithmetic helper** — decimals, rounding, currency parsing.
- **Every business rule enforcement** — period lock, credit limit, negative stock, duplicate guard.
- **Every sync conflict scenario.**
- **Every API endpoint** — at minimum: 200 happy path, 400 validation error, 403 permission denied, 404 not found, 409 conflict where applicable.

### 12.2 Test Layout

```
src/feature.ts
src/feature.test.ts          # adjacent
tests/integration/...        # cross-module integration
tests/e2e/...                # full app via Playwright
```

### 12.3 Test Names Describe Behavior

```ts
// ❌ NOT useful
test('createInvoice works', ...);

// ✅ Useful
test('createInvoice rejects when customer credit limit would be exceeded', ...);
test('createInvoice issues gap-free numbers across concurrent saves', ...);
```

### 12.4 No Network in Unit Tests

Mock the DB and external APIs. Integration tests can hit a real test DB.

### 12.5 No Sleep / Timeout-Based Flakes

If a test needs to wait, use `vi.useFakeTimers()` or proper polling. Never `setTimeout` for "give it a second."

### 12.6 Snapshot Tests Sparingly

Snapshots are fine for stable output (rendered invoice HTML, tax calculation results). Not for UI components — they cause maintenance pain.

---

## 13. Performance Rules

### 13.1 Targets (from BRD)

- Local operations (POS save, item search): < 100 ms p95.
- API operations: < 500 ms p95.
- Sync round-trip: < 2 s p95.
- Cold start: < 3 s on 4 GB RAM Windows.
- Report queries: < 3 s for 1-year window.

If your change pushes any of these, profile and fix before merge.

### 13.2 N+1 Queries Are Bugs

```ts
// ❌ N+1
const invoices = await db.select().from(invoices);
for (const inv of invoices) {
  inv.lines = await db.select().from(invoice_lines).where(eq(invoice_lines.invoice_id, inv.id));
}

// ✅ Single query
const invoices = await db.select()
  .from(invoices)
  .leftJoin(invoice_lines, ...)
  .where(...);
// then group in memory
```

Drizzle's `with` (relations) handles this cleanly. Use it.

### 13.3 Paginate Lists

No endpoint returns an unbounded list. Default page size 50, max 200. Every list endpoint supports cursor pagination.

### 13.4 Index Before You Optimize

Most "slow query" issues are missing indexes, not bad code. Run `EXPLAIN ANALYZE` before you "optimize the algorithm."

### 13.5 Virtualize Long Lists in UI

> 200 rows in a table → virtualize via TanStack Virtual. Otherwise the DOM bloats.

### 13.6 Lazy-Load Heavy Modules

Reports, advanced settings, manufacturing module — lazy-loaded routes. Initial bundle stays small.

### 13.7 Image Sizes

Item images: resize to 800 px max on client before upload. Logos: 200 × 80 max. Never serve original-resolution images to clients.

---

## 14. Commits, Branches, PRs

### 14.1 Commit Messages

Conventional commits:

```
feat(pos): add F12 hotkey for save & print
fix(stock): correct running balance after batch transfer
refactor(api): extract invoice service from route handler
docs(api): clarify sync conflict resolution
chore(deps): upgrade fastify to 4.27.0
test(tax): add cases for composition scheme
perf(reports): index purchase_invoices for vendor ledger
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `perf`, `style`, `build`, `ci`.

### 14.2 Branches

- `main` — protected, always deployable.
- `feat/<short-name>` — feature branches.
- `fix/<short-name>` — bug fixes.
- One feature per branch.

### 14.3 PR Requirements

- All tests pass.
- All linters pass (eslint, biome, tsc).
- One reviewer approval.
- Description includes: what changed, why, what was tested.
- No "WIP" merges.
- No giant PRs — split if > 500 lines diff (excluding generated files).

### 14.4 Don't Bypass CI

If CI fails, fix it. Don't `--no-verify` your commit, don't disable rules, don't skip tests. If a test is genuinely wrong, fix the test in a separate commit with explanation.

---

## 15. Documentation

### 15.1 Code Is Documentation First

- Clear names beat comments.
- Comments explain **why**, not **what**.
- TSDoc on public functions in `packages/`.

### 15.2 Decision Records

For any architectural decision (a new dependency, a schema change, a new pattern), write a 1-page ADR in `docs/decisions/`:

```
docs/decisions/0007-use-uuid-v7-for-all-ids.md

# 0007: Use UUID v7 for All IDs

Date: 2026-03-12
Status: Accepted
Context: ...
Decision: ...
Consequences: ...
```

### 15.3 Specs Stay Current

If you change behavior covered in `Counter_BRD_FSD.md`, `Counter_FSD_Extended.md`, `Counter_API_Spec.md`, etc. — update the doc in the same PR. Stale specs are worse than missing specs.

---

## 16. When in Doubt

### 16.1 Stop and Ask

Some signals that should make you stop:

- "I should probably mock this for now" → ask first.
- "This is a one-off so I'll just hardcode" → ask first.
- "The spec says X but I think Y is better" → ask first.
- "I'll skip the audit log this once" → no, don't, but if you really think you should, ask first.
- "I'll add `any` here because the types are annoying" → no.
- "I'll wrap this in try-catch and ignore" → no.

### 16.2 Don't Invent Requirements

If you find a case the spec doesn't cover, don't guess. Ask the human:
- What's the expected behavior?
- What's the error message?
- Should this be allowed at all?

Inventing requirements is how features drift and become inconsistent across the product.

### 16.3 Don't Refactor Without a Reason

Don't "improve" code you don't have to touch. Refactoring PRs that mix in unrelated changes are hard to review and easy to break. If you see something genuinely wrong, file an issue.

### 16.4 Respect the Existing Patterns

If the codebase does X a certain way and you think there's a "better" way, the cost of inconsistency usually exceeds the benefit. Match the existing style. If you genuinely want to change the pattern, that's a separate, intentional refactor — not a side effect of your feature work.

---

## 17. Common Mistakes (Things AI Assistants Get Wrong on This Project)

Documenting these so you don't repeat them:

1. **Storing current stock as a column on `items`.** Don't. It's derived from `stock_ledger`. See §1.2.
2. **Using floats for money.** Decimal.js always. See §1.1.
3. **Forgetting `org_id` in queries.** Every query. Every time. See §1.5.
4. **Hardcoding GST rates (`* 0.18`).** Look up versioned tax rates. See §1.9.
5. **Using `moment` because it's familiar.** Use date-fns. See §2.1–§2.2.
6. **Writing a bespoke React form because "this case is special."** Use the form schema system unless the screen is genuinely non-form. See §7.5.
7. **Importing from `material-ui` / `chakra` / `antd`.** Banned. shadcn/ui only. See §2.2.
8. **Mixing snake_case and camelCase.** DB is snake_case, TypeScript is camelCase. Drizzle handles the mapping. See §4.5.
9. **Not wrapping invoice/purchase saves in a transaction.** Multi-table writes are always atomic. See §1.4.
10. **Forgetting the audit log.** Every business write has an audit entry. See §1.8.
11. **Hard-deleting rows.** Soft delete only. See §1.6.
12. **Writing reports that table-scan without indexes.** Profile with EXPLAIN ANALYZE before merging. See §13.4.
13. **Building features that require online to work.** Counter is offline-first. See §1.12.
14. **Inventing invoice numbers client-side without using reserved ranges.** Server-authoritative numbers, client reserves ranges. See §9.3.
15. **Using `any` because the types are inconvenient.** Branded types, Zod parsers, discriminated unions. See §4.2.
16. **Putting auth logic in route handlers.** Use the auth hook + permission middleware.
17. **Console.log debugging left in.** Use `ctx.log.debug()`. See §6.8.
18. **Adding a dependency without checking the approved list.** See §2.1.
19. **Inline styles instead of Tailwind.** See §7.3.
20. **English literal strings in UI.** Use i18n keys. See §7.10.

---

## 18. Quick Reference Card

| Need to... | Use... |
|------------|--------|
| Money math | `decimal.js` |
| Dates | `date-fns`, `parseISO`, `format` |
| Generate ID | `uuidv7()` |
| Validate input | Zod schema |
| Fetch data | TanStack Query |
| Form state | React Hook Form |
| Build a form | JSON schema + `<FormRenderer>` |
| Show money | `<PriceDisplay>` |
| Show qty | `<QuantityDisplay>` |
| Show date | `<DateDisplay>` |
| Table | `<DataTable>` |
| Editable grid | `<EditableGrid>` |
| Customer/Item picker | `<Lookup>` |
| Modal | `<Dialog>` |
| Side panel | `<Drawer>` |
| Toast | `useToast()` |
| Confirm action | `useConfirm()` |
| Background job | `jobQueue.add(...)` |
| Log | `ctx.log.info(...)` |
| Compute tax | `@counter/tax` |
| Run a transaction | `db.transaction(async (trx) => { ... })` |
| Optimistic update | `If-Match: row_version` header |
| Idempotent create | `Idempotency-Key` header |
| Search server-side | `searchEndpoint` on `<Lookup>` |
| Search client-side | `fuse.js` |
| Multi-language string | `t('key')` from `useTranslation()` |
| Print thermal | `@counter/printer` (ESC/POS) |
| Print A4 | `puppeteer` via `@counter/printer/pdf` |

---

## 19. Final Word

This codebase serves real shopkeepers, mechanics, and small manufacturers. A bug here doesn't just inconvenience a user — it can mean a wrong bill, a stock mismatch, a tax filing error, a customer dispute. Take that seriously.

When you write code on Counter:
- **Be conservative.** Reach for the boring, well-tested option.
- **Think about offline.** Half our users have spotty internet.
- **Think about non-technical operators.** They use this all day at high speed; they shouldn't have to think.
- **Respect the data.** It's their livelihood.

If a rule in this document is unclear, ask. If a rule seems wrong for your case, ask. **Don't just decide.**

---

*Last updated: 2026-05-30. Maintained by the Counter engineering team. Edits via PR with review.*
