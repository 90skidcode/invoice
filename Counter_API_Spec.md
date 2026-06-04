# Counter — API Specification

**Companion to** `Counter_BRD_FSD.md`
**Version:** 1.0
**Audience:** Backend, Frontend, Mobile, Integration partners

---

## 1. Conventions

### 1.1 Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.counter.app` |
| Staging | `https://api-staging.counter.app` |
| Self-hosted | configured per org |

### 1.2 Versioning

All endpoints prefixed with `/v1/`. Breaking changes ship as `/v2/`. Deprecations announced 6 months ahead via `Sunset` and `Deprecation` headers.

### 1.3 Headers

Standard headers expected on every request:

| Header | Purpose |
|--------|---------|
| `Authorization: Bearer {jwt}` | All endpoints except `/auth/*` |
| `X-Org-Id: {uuid}` | Org context (some users belong to multiple orgs) |
| `X-Device-Id: {uuid}` | Device making the request |
| `X-Client-Version: 1.4.2` | For min-version enforcement |
| `Idempotency-Key: {uuid}` | Required on POST that creates a row |
| `Content-Type: application/json` | All non-upload endpoints |
| `Accept-Language: en-IN` | Locale for messages |

Response headers:

| Header | Purpose |
|--------|---------|
| `X-Request-Id` | UUID for support / log correlation |
| `X-Rate-Limit-Remaining` | Calls left in current window |
| `X-Rate-Limit-Reset` | Epoch seconds when window resets |
| `X-Schema-Version` | DB schema version for client to detect drift |

### 1.4 Response Envelope

Every response has the shape:

```json
{
  "ok": true,
  "data": { ... },
  "meta": { "request_id": "...", "server_time": "2026-05-30T12:34:56Z" }
}
```

On error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Human readable summary",
    "details": [
      { "field": "invoice_lines[0].qty", "code": "MUST_BE_POSITIVE", "message": "Quantity must be greater than zero" }
    ],
    "request_id": "..."
  }
}
```

### 1.5 Error Code Catalog

| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_FAILED` | Request body failed schema/business validation |
| 400 | `BUSINESS_RULE_VIOLATION` | E.g. negative stock without override |
| 401 | `UNAUTHENTICATED` | Missing/invalid JWT |
| 401 | `TOKEN_EXPIRED` | Refresh required |
| 403 | `FORBIDDEN` | Authenticated but not permitted |
| 403 | `ORG_SUSPENDED` | Org plan inactive |
| 404 | `NOT_FOUND` | Resource doesn't exist or scoped out |
| 409 | `CONFLICT` | Duplicate, optimistic concurrency mismatch |
| 409 | `SYNC_CONFLICT` | Sync-level conflict, manual resolution needed |
| 410 | `GONE` | Soft-deleted resource |
| 422 | `UNPROCESSABLE` | Well-formed but semantically wrong |
| 423 | `LOCKED` | Period locked, record locked |
| 429 | `RATE_LIMITED` | Slow down |
| 451 | `LEGAL_HOLD` | Subject to audit hold, no edits |
| 500 | `INTERNAL` | Server error (with safe id for support) |
| 503 | `MAINTENANCE` | Planned downtime |

### 1.6 Pagination

Cursor-based for all list endpoints:

Request: `?limit=50&cursor={opaque}&sort=created_at:desc`
Response:
```json
{
  "data": [ ... ],
  "page": {
    "limit": 50,
    "next_cursor": "eyJpZCI6Li4ufQ==",
    "has_more": true
  }
}
```

Max limit per endpoint is 200 unless noted; default 50.

### 1.7 Filtering & Sorting

- Filters via query params: `?status=active&created_after=2026-01-01&customer_id=...`
- Sorting: `?sort=invoice_date:desc,grand_total:asc` (multi-key).
- Full-text search: `?q=ravi` — uses trigram index on relevant fields.
- Date ranges: `?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` (inclusive).

### 1.8 Idempotency

POST endpoints that create resources accept `Idempotency-Key: {uuid}`. Server stores `(org_id, idempotency_key, endpoint)` → response for 24 hrs. Replays return the original response, never duplicate. Clients SHOULD generate a UUID v7 per logical operation and retry until success or 4xx.

### 1.9 Optimistic Concurrency

Update endpoints accept and require `If-Match: "{row_version}"`. Mismatch → 409 with current `row_version` so client can re-fetch and merge.

### 1.10 Rate Limits

| Tier | Per minute | Per day |
|------|------------|---------|
| Default (UI calls) | 600 | 100,000 |
| Sync push | 1200 | 500,000 |
| Webhooks (org) | 60 | 10,000 |
| Reports (heavy) | 30 | 2,000 |

Per IP fallback if no auth. 429 with `Retry-After` header.

### 1.11 Time, Money, Numbers

- All timestamps in ISO 8601 with TZ: `2026-05-30T12:34:56+05:30`.
- Money: string-encoded decimals (`"1234.56"`) to avoid float precision loss. Server normalizes.
- Quantities: same convention, up to 3 decimals.

### 1.12 IDs

All resource IDs are UUID v7. Client may pre-generate to enable offline create + idempotent sync.

---

## 2. Authentication

### 2.1 `POST /v1/auth/login`

**Request:**
```json
{
  "identifier": "9876543210",
  "credential": "1234",
  "credential_type": "pin",
  "org_code": "ABC-12345",
  "device": {
    "id": "uuid-v7",
    "name": "Counter 1",
    "platform": "win",
    "app_version": "1.4.2",
    "install_id": "hw-abc"
  }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| identifier | Y | phone / username / email |
| credential | Y | PIN or password |
| credential_type | Y | `pin` / `password` / `otp` |
| org_code | C | required if user belongs to multiple orgs |
| device | Y | device fingerprint |

**Response 200:**
```json
{
  "ok": true,
  "data": {
    "access_token": "eyJ...",  // JWT, 15 min
    "refresh_token": "...",     // 30 days
    "expires_in": 900,
    "user": { "id": "...", "name": "Ravi", "role": "owner", "branches": [...] },
    "org": { "id": "...", "name": "Ravi Stores", "industry_profile": "retail", ... },
    "permissions": ["invoice.create", "item.edit", ...]
  }
}
```

**Errors:** 401 `UNAUTHENTICATED`, 423 `ACCOUNT_LOCKED` (with `locked_until`), 403 `ORG_SUSPENDED`, 426 `UPGRADE_REQUIRED` (app version too old).

### 2.2 `POST /v1/auth/refresh`

**Request:** `{ "refresh_token": "..." }`
**Response:** new access_token + refresh_token (rotating).

### 2.3 `POST /v1/auth/logout`

Revokes refresh token on server, clears device session.

### 2.4 `POST /v1/auth/otp/send`

For forgot-PIN flow. Body: `{ "phone": "...", "purpose": "reset_pin" }`. Sends SMS / WhatsApp OTP. Rate-limited to 3/hr per identifier.

### 2.5 `POST /v1/auth/otp/verify`

Body: `{ "phone": "...", "otp": "123456", "purpose": "reset_pin" }` → returns short-lived `reset_token`.

### 2.6 `POST /v1/auth/pin/reset`

Body: `{ "reset_token": "...", "new_pin": "..." }`.

### 2.7 `POST /v1/auth/2fa/enable`

Returns TOTP secret + recovery codes. Subsequent logins from new devices require TOTP code.

### 2.8 `GET /v1/auth/me`

Current user + permissions + org context.

### 2.9 `POST /v1/auth/device/revoke`

Body: `{ "device_id": "..." }`. Owner/Admin only.

---

## 3. Organizations & Branches

### 3.1 `POST /v1/orgs/signup`

Create a new org with first owner. Body includes business info + first user.

### 3.2 `GET /v1/orgs/current`

Current org details.

### 3.3 `PATCH /v1/orgs/current`

Update org. Owner only.

### 3.4 `GET /v1/branches`

List branches.

### 3.5 `POST /v1/branches`

Create branch.

### 3.6 `PATCH /v1/branches/{id}`

Update branch.

### 3.7 `GET /v1/locations`

List stock locations (filterable by branch).

### 3.8 `POST /v1/locations`

Create stock location.

### 3.9 `GET /v1/devices`

List registered devices.

### 3.10 `DELETE /v1/devices/{id}`

Revoke device.

---

## 4. Users & Roles

### 4.1 `GET /v1/users`

List users in org with role + branch access.

### 4.2 `POST /v1/users`

Create user.

```json
{
  "name": "Priya",
  "phone": "9876543210",
  "email": "priya@example.com",
  "role": "cashier",
  "branch_ids": ["uuid", "uuid"],
  "default_branch_id": "uuid",
  "is_salesperson": true,
  "initial_pin": "4321",
  "force_pin_change": true
}
```

### 4.3 `PATCH /v1/users/{id}`

Edit fields. Role change re-evaluates permissions.

### 4.4 `POST /v1/users/{id}/suspend`

### 4.5 `POST /v1/users/{id}/reactivate`

### 4.6 `POST /v1/users/{id}/reset-pin`

### 4.7 `POST /v1/users/{id}/force-logout`

### 4.8 `GET /v1/users/{id}/permissions`

Effective permissions including overrides.

### 4.9 `PUT /v1/users/{id}/permissions`

Overrides:
```json
{ "overrides": [{ "key": "invoice.void", "allowed": true }] }
```

### 4.10 `GET /v1/roles`

List roles + default permission keys.

---

## 5. Master Data — Items

### 5.1 `GET /v1/items`

Query params: `q`, `category_id`, `brand_id`, `status`, `is_service`, `is_batched`, `barcode`, `sku`, `low_stock=true`, `expiring_in_days=30`.

Response: items array.

### 5.2 `GET /v1/items/{id}`

Full item with all tabs' data + current stock per location.

### 5.3 `GET /v1/items/lookup`

Lightweight type-ahead. Params: `q` (min 2 chars), `limit=10`. Returns `[{ id, sku, name, sale_price, current_stock, unit }]`. Used by POS.

### 5.4 `POST /v1/items`

Create item. Full body matching SCR-ITM-02 fields.

### 5.5 `PATCH /v1/items/{id}`

Update. Requires `If-Match`.

### 5.6 `DELETE /v1/items/{id}`

Soft delete. 422 if any transactions reference it.

### 5.7 `POST /v1/items/import`

Bulk import. Multipart with Excel file. Returns async job ID; poll `/v1/jobs/{id}` for progress.

### 5.8 `POST /v1/items/export`

Triggers async export; returns job ID; file URL via job.

### 5.9 `GET /v1/items/{id}/stock`

Current stock at each location, with batch breakdown if batched.

### 5.10 `GET /v1/items/{id}/price-history`

### 5.11 `GET /v1/items/{id}/sales-history`

Aggregated sales over time.

### 5.12 `POST /v1/items/bulk-price-update`

```json
{
  "filter": { "category_id": "...", "brand_id": "..." },
  "operation": "increase_percent",
  "value": "5",
  "fields": ["sale_price"],
  "effective_from": "2026-06-01",
  "dry_run": true
}
```

`dry_run: true` returns count + preview without committing.

### 5.13 `GET /v1/barcodes/resolve/{barcode}`

Returns item + variant by barcode (across all units). The POS hits this on scan.

### 5.14 `POST /v1/items/{id}/barcodes`

Add barcode.

### 5.15 `DELETE /v1/items/{id}/barcodes/{barcode_id}`

---

## 6. Master Data — Customers & Vendors

### 6.1 `GET /v1/customers`

Filters: `q`, `group_id`, `has_balance`, `inactive_days`, `city`, `state`.

### 6.2 `GET /v1/customers/{id}`

### 6.3 `GET /v1/customers/lookup`

Type-ahead with `q`. Returns `[{ id, name, phone, price_tier_id, credit_status }]`.

### 6.4 `POST /v1/customers`

### 6.5 `PATCH /v1/customers/{id}`

### 6.6 `DELETE /v1/customers/{id}` (soft)

### 6.7 `GET /v1/customers/{id}/ledger`

Params: `date_from`, `date_to`, `open_only=true`.

Returns running-balance ledger with each transaction.

### 6.8 `GET /v1/customers/{id}/statement`

Returns statement object suitable for PDF rendering.

### 6.9 `POST /v1/customers/{id}/statement/send`

Body: `{ "channels": ["whatsapp","email"], "period_from": "...", "period_to": "..." }`. Triggers async send.

### 6.10 `GET /v1/customers/{id}/outstanding`

Just open invoices summary.

### 6.11 Vendors

Mirror endpoints: `/v1/vendors`, `/v1/vendors/{id}`, `/v1/vendors/lookup`, `/v1/vendors/{id}/ledger`, `/v1/vendors/{id}/outstanding`.

### 6.12 Customer Groups

`GET/POST /v1/customer-groups`, `PATCH/DELETE /v1/customer-groups/{id}`.

### 6.13 Vehicles (Workshop)

`GET/POST /v1/vehicles`
`GET /v1/vehicles/{id}`
`GET /v1/vehicles?customer_id=...`
`GET /v1/vehicles/{id}/service-history`

---

## 7. Master Data — Lookups

### 7.1 Units

`GET /v1/units`, `POST /v1/units`, `PATCH /v1/units/{id}`.

### 7.2 Categories

`GET /v1/categories?parent_id=...`
`POST /v1/categories`
`PATCH /v1/categories/{id}`

### 7.3 Brands

CRUD on `/v1/brands`.

### 7.4 HSN

`GET /v1/hsn-codes?q=...` — search official HSN database (read-only).
`GET /v1/hsn-codes/{code}` — details + default GST rate.

### 7.5 Tax Rates

`GET /v1/tax-rates?effective_on=YYYY-MM-DD`
`POST /v1/tax-rates`
`PATCH /v1/tax-rates/{id}`
`POST /v1/tax-rates/{id}/expire` — sets effective_to.

### 7.6 Price Tiers

CRUD on `/v1/price-tiers`.

### 7.7 Bank Accounts

CRUD on `/v1/bank-accounts`.

### 7.8 Payment Modes

`GET /v1/payment-modes`
`PATCH /v1/payment-modes/{id}` — enable/disable a mode.

### 7.9 Invoice Series

CRUD on `/v1/invoice-series`.

---

## 8. Transactions — Sales / Invoices

### 8.1 `GET /v1/invoices`

Query params: `date_from`, `date_to`, `customer_id`, `series_id`, `branch_id`, `status`, `payment_status`, `salesperson_id`, `min_amount`, `max_amount`, `q` (invoice no or customer name).

### 8.2 `GET /v1/invoices/{id}`

Full invoice with lines, payments, audit trail.

### 8.3 `GET /v1/invoices/by-number/{series_id}/{number}`

For barcode-scanning a printed invoice.

### 8.4 `POST /v1/invoices`

Create posted invoice in one call. Server assigns final invoice number (gap-free per series).

```json
{
  "client_id": "uuid-v7",
  "series_id": "uuid",
  "branch_id": "uuid",
  "invoice_date": "2026-05-30",
  "customer_id": "uuid|null",
  "place_of_supply": "29",
  "salesperson_id": "uuid",
  "reference_no": "PO-12",
  "lines": [
    {
      "client_id": "uuid-v7",
      "item_id": "uuid",
      "qty": "2",
      "unit_id": "uuid",
      "rate": "199.00",
      "discount_pct": "0",
      "tax_rate_id": "uuid",
      "batch_id": "uuid|null",
      "location_id": "uuid",
      "is_free": false
    }
  ],
  "other_charges": [
    { "type": "freight", "amount": "50.00", "gst_applicable": true, "tax_rate_id": "uuid" }
  ],
  "payments": [
    { "mode": "cash", "amount": "400.00" },
    { "mode": "upi", "amount": "50.00", "reference": "UPI/123" }
  ],
  "notes": "Thanks!",
  "auto_print": false
}
```

**Response 201:**
```json
{
  "data": {
    "id": "...",
    "invoice_no": "INV-2025-26/0123",
    "grand_total": "450.00",
    "invoice_hash": "abcd1234...",
    "signed_qr_data": "base64...",
    "irn": null,
    "pdf_url": "https://.../invoices/{id}.pdf",
    "thermal_html_url": "https://.../invoices/{id}/thermal",
    "computed_lines": [ ... ]
  }
}
```

Server-side validations performed:
- Stock availability (unless override).
- Customer credit limit.
- Period lock.
- Tax recomputation cross-check (client values must match within ₹0.01).
- Series gap-free assignment.

### 8.5 `PATCH /v1/invoices/{id}`

Edit allowed only within lock window AND if `payment_status != paid`. Some fields immutable (invoice_no, series_id, invoice_date if >24h old).

### 8.6 `POST /v1/invoices/{id}/void`

```json
{ "reason": "Wrong customer selected", "approver_pin": "..." }
```

Voids invoice (status), reverses stock_ledger entries, reverses payments allocations.

### 8.7 `POST /v1/invoices/{id}/duplicate`

Creates a new draft invoice with same lines, today's date, new customer optional.

### 8.8 `GET /v1/invoices/{id}/pdf`

Returns PDF stream. `?paper=a4|thermal58|thermal80` selects template.

### 8.9 `GET /v1/invoices/{id}/thermal-html`

Returns standalone HTML (see Invoice Templates spec). For local thermal print.

### 8.10 `POST /v1/invoices/{id}/send`

```json
{ "channels": ["whatsapp", "email"], "to": "9876543210", "subject": "Your invoice", "message": "Thanks!" }
```

### 8.11 `GET /v1/invoices/{id}/verify`

Public endpoint (no auth) — verifies invoice authenticity via hash. Used by QR on printed invoice. Returns minimal data: invoice_no, date, total, customer, status, verified=true.

### 8.12 `POST /v1/invoices/drafts`

Save a draft (held bill). Idempotent.

### 8.13 `GET /v1/invoices/drafts`

List drafts for current device.

### 8.14 `DELETE /v1/invoices/drafts/{id}`

### 8.15 `POST /v1/invoices/{id}/eway-bill`

Body: transporter info, distance. Generates e-way bill via NIC API (Phase 2).

### 8.16 `POST /v1/invoices/{id}/irn`

Generates e-invoice IRN (Phase 2).

---

## 9. Credit Notes

`GET /v1/credit-notes`
`GET /v1/credit-notes/{id}`
`POST /v1/credit-notes` (body includes `original_invoice_id`, reason, refund_mode, lines)
`POST /v1/credit-notes/{id}/void`
`GET /v1/credit-notes/{id}/pdf`
`POST /v1/credit-notes/{id}/send`

---

## 10. Purchase

### 10.1 `GET /v1/purchase-invoices`

### 10.2 `GET /v1/purchase-invoices/{id}`

### 10.3 `POST /v1/purchase-invoices`

```json
{
  "client_id": "uuid",
  "vendor_id": "uuid",
  "vendor_invoice_no": "VINV-12345",
  "vendor_invoice_date": "2026-05-28",
  "voucher_date": "2026-05-30",
  "place_of_supply": "29",
  "reverse_charge": false,
  "receive_location_id": "uuid",
  "linked_po_id": "uuid|null",
  "lines": [
    {
      "client_id": "uuid",
      "item_id": "uuid",
      "qty": "100",
      "free_qty": "10",
      "unit_id": "uuid",
      "rate": "45.00",
      "discount_pct": "0",
      "tax_rate_id": "uuid",
      "batch_no": "B-2026-05",
      "mfg_date": "2026-04-01",
      "expiry_date": "2027-04-01",
      "mrp": "60.00",
      "location_id": "uuid",
      "update_item_cost": true
    }
  ],
  "other_charges": [...],
  "eway_bill_no": "..."
}
```

### 10.4 `PATCH /v1/purchase-invoices/{id}` (within lock)

### 10.5 `POST /v1/purchase-invoices/{id}/void`

### 10.6 `GET /v1/purchase-invoices/{id}/pdf` (GRN)

### 10.7 Purchase Orders

`GET/POST /v1/purchase-orders`
`PATCH /v1/purchase-orders/{id}`
`POST /v1/purchase-orders/{id}/send`
`POST /v1/purchase-orders/{id}/acknowledge`
`POST /v1/purchase-orders/{id}/cancel`
`POST /v1/purchase-orders/{id}/convert` → creates draft purchase invoice.
`GET /v1/purchase-orders/{id}/pdf`
`GET /v1/purchase-orders/suggested` — auto-generated suggestions from reorder levels.

### 10.8 Debit Notes

Mirror credit notes. `GET/POST /v1/debit-notes` with `original_purchase_invoice_id`.

---

## 11. Inventory

### 11.1 `GET /v1/stock-ledger`

Required: `item_id`. Optional: `location_id`, `batch_id`, `date_from`, `date_to`, `types[]`.
Returns ledger entries + summary (opening, in, out, closing).

### 11.2 `GET /v1/stock/current`

Current stock snapshot. Params: `item_ids[]` (max 200) or `location_id`. Returns array of `{ item_id, location_id, batch_id, qty, avg_cost, value }`.

### 11.3 `GET /v1/stock/valuation`

Org-wide stock value. Params: `as_of=YYYY-MM-DD`, `branch_id`, `category_id`.

Returns: total value, by-category breakdown, top items.

### 11.4 `GET /v1/stock/low`

Items at or below reorder level. Returns suggested PO grouping by vendor.

### 11.5 `GET /v1/stock/expiring`

Params: `days=30`. Returns batches expiring within window.

### 11.6 `POST /v1/stock-adjustments`

```json
{
  "client_id": "uuid",
  "adjustment_date": "2026-05-30",
  "location_id": "uuid",
  "reason": "damaged",
  "reason_note": "Water damage in storage",
  "cost_source": "moving_avg",
  "lines": [
    { "item_id": "uuid", "batch_id": "uuid|null", "qty_change": "-5", "rate": "100.00", "note": "..." }
  ]
}
```

### 11.7 `GET /v1/stock-adjustments`

### 11.8 `GET /v1/stock-adjustments/{id}`

### 11.9 `POST /v1/stock-transfers`

```json
{
  "client_id": "uuid",
  "transfer_date": "...",
  "from_location_id": "uuid",
  "to_location_id": "uuid",
  "mode": "in_transit",
  "transporter": "...",
  "vehicle_no": "...",
  "expected_by": "...",
  "lines": [ ... ]
}
```

### 11.10 `GET /v1/stock-transfers`

### 11.11 `POST /v1/stock-transfers/{id}/receive`

Receiver marks lines received (with possible variance which auto-creates adjustment).

### 11.12 Batches

`GET /v1/batches?item_id=&status=&expiring_in=`
`GET /v1/batches/{id}`
`POST /v1/batches/{id}/recall`
`POST /v1/batches/{id}/force-expire`
`GET /v1/batches/{id}/movements` — drills to stock ledger filtered by batch.

---

## 12. Workshop / Job Cards

### 12.1 `GET /v1/job-cards`

Filters: status, mechanic, customer, date_range, priority.

### 12.2 `GET /v1/job-cards/{id}`

### 12.3 `POST /v1/job-cards`

Header + complaints + parts + labor.

### 12.4 `PATCH /v1/job-cards/{id}`

### 12.5 `POST /v1/job-cards/{id}/status`

```json
{ "status": "in_progress", "note": "..." }
```

Status-machine transitions enforced.

### 12.6 `POST /v1/job-cards/{id}/complaints` — Add/edit complaints.

### 12.7 `POST /v1/job-cards/{id}/parts` — Add/remove parts.

### 12.8 `POST /v1/job-cards/{id}/labor` — Add/remove labor.

### 12.9 `POST /v1/job-cards/{id}/photos`

Multipart upload, type=before|during|after, caption.

### 12.10 `POST /v1/job-cards/{id}/approval/request`

```json
{ "method": "whatsapp", "to": "9876543210", "expires_in_hours": 48 }
```

Returns shareable signed URL.

### 12.11 `POST /v1/job-cards/{id}/approval/confirm`

Customer endpoint hit from approval link (signed JWT). Body: signature image base64 or "agreed".

### 12.12 `POST /v1/job-cards/{id}/convert-to-invoice`

Returns new invoice id.

### 12.13 `GET /v1/job-cards/{id}/pdf` (job card document)

### 12.14 Service Reminders

`GET /v1/service-reminders?status=due&date=YYYY-MM-DD`
`POST /v1/service-reminders/{id}/notify`

---

## 13. Manufacturing

### 13.1 BOMs

`GET /v1/boms` — filters: finished_good_id, active, effective_on.
`GET /v1/boms/{id}`
`POST /v1/boms` — body includes components + byproducts.
`POST /v1/boms/{id}/versions` — create new version with same FG.
`PATCH /v1/boms/{id}` — limited fields; major changes create new version.
`POST /v1/boms/{id}/activate` / `/deactivate`.
`GET /v1/boms/where-used?item_id=...` — reverse lookup.

### 13.2 Production Orders

`GET /v1/production-orders`
`GET /v1/production-orders/{id}`
`POST /v1/production-orders`
`POST /v1/production-orders/{id}/start`
`POST /v1/production-orders/{id}/complete`

```json
{
  "input_actuals": [
    { "line_id": "uuid", "qty_actual": "9.5", "batch_id": "uuid" }
  ],
  "output_actuals": [
    { "line_id": "uuid", "qty_actual": "100", "batch_no": "BX-2026-05", "expiry_date": "2027-05-30" }
  ]
}
```

`POST /v1/production-orders/{id}/cancel`
`GET /v1/production-orders/{id}/cost-analysis`

### 13.3 Batch Traceability

`GET /v1/traceability/forward?batch_id=...` — what invoices/customers consumed this batch.
`GET /v1/traceability/backward?batch_id=...` — what raw batches produced this batch.

---

## 14. Finance

### 14.1 Payments

`GET /v1/payments?direction=inbound&party_id=&date_from=...`
`GET /v1/payments/{id}`
`POST /v1/payments`

```json
{
  "client_id": "uuid",
  "payment_date": "2026-05-30",
  "direction": "inbound",
  "party_type": "customer",
  "party_id": "uuid",
  "amount": "1000.00",
  "mode": "upi",
  "account_id": "uuid",
  "reference": "UPI/Ref/123",
  "allocations": [
    { "invoice_id": "uuid", "amount": "700.00" },
    { "invoice_id": "uuid", "amount": "300.00" }
  ],
  "discount_given": "0.00",
  "write_off": "0.00",
  "narration": "..."
}
```

`POST /v1/payments/{id}/void`
`GET /v1/payments/{id}/pdf` — receipt.

### 14.2 Expenses

`GET /v1/expenses?category_id=&date_from=...`
`GET /v1/expenses/{id}`
`POST /v1/expenses`
`PATCH /v1/expenses/{id}`
`POST /v1/expenses/{id}/void`

### 14.3 Bank Account Operations

`GET /v1/bank-accounts/{id}/balance` — current + projected (after pending cheques).
`GET /v1/bank-accounts/{id}/transactions?date_from=&date_to=`
`POST /v1/bank-accounts/contra` — bank-to-bank transfer.

---

## 15. Reports

All report endpoints are GET, accept date_range + filters, return both summary + drill-down data.

### 15.1 Sales Reports

| Endpoint | Description |
|----------|-------------|
| `/v1/reports/sales/daybook` | Per-day list |
| `/v1/reports/sales/by-item` | Item-wise summary |
| `/v1/reports/sales/by-customer` | Customer-wise |
| `/v1/reports/sales/by-salesperson` | Per salesperson |
| `/v1/reports/sales/by-category` | Per category |
| `/v1/reports/sales/by-hour` | Hour-of-day heatmap |
| `/v1/reports/sales/top-items?metric=qty\|value` | Top N |
| `/v1/reports/sales/slow-movers?days=90` | No sale in N days |
| `/v1/reports/sales/profit?group_by=item\|category\|customer` | Sales − COGS |

### 15.2 Purchase Reports

`/v1/reports/purchase/by-vendor`
`/v1/reports/purchase/by-item`
`/v1/reports/purchase/pending-pos`

### 15.3 Stock Reports

`/v1/reports/stock/summary?as_of=` — qty + value by item.
`/v1/reports/stock/movement?date_from=&date_to=` — period in/out.
`/v1/reports/stock/aging` — how long items have been in stock.
`/v1/reports/stock/batch-summary`
`/v1/reports/stock/valuation-summary`

### 15.4 GST Reports

`/v1/reports/gst/gstr1?period=YYYY-MM&format=json|excel|csv`
`/v1/reports/gst/gstr3b?period=YYYY-MM`
`/v1/reports/gst/hsn-summary?period=`
`/v1/reports/gst/itc-register?period=`
`/v1/reports/gst/validation?period=` — pre-flight errors.

### 15.5 Financial

`/v1/reports/financial/receivables?as_of=&aging=true`
`/v1/reports/financial/payables?as_of=&aging=true`
`/v1/reports/financial/cashflow?date_from=&date_to=`
`/v1/reports/financial/profit-loss?date_from=&date_to=` — simple
`/v1/reports/financial/daily-collection?date=`

### 15.6 Workshop

`/v1/reports/workshop/mechanic-productivity?date_from=`
`/v1/reports/workshop/ticket-size`
`/v1/reports/workshop/repeat-rate`

### 15.7 Manufacturing

`/v1/reports/manufacturing/yield?bom_id=`
`/v1/reports/manufacturing/cost-variance`
`/v1/reports/manufacturing/batch-traceability?batch_id=`

### 15.8 Schedule Reports

`POST /v1/reports/schedule`

```json
{
  "report_path": "/v1/reports/financial/daily-collection",
  "params": { "date": "today" },
  "schedule": { "frequency": "daily", "time": "21:00", "tz": "Asia/Kolkata" },
  "channels": ["email", "whatsapp"],
  "recipients": ["owner@org.com", "+919876543210"],
  "format": "pdf"
}
```

`GET /v1/reports/schedule`
`PATCH /v1/reports/schedule/{id}`
`DELETE /v1/reports/schedule/{id}`

### 15.9 Async / Heavy Exports

Heavy reports return `202 Accepted` with `job_id`. Client polls `GET /v1/jobs/{id}`:

```json
{ "status": "running|done|failed", "progress": 0.65, "result_url": "..." }
```

---

## 16. Sync API ⭐

This is the heart of multi-device operation.

### 16.1 Concepts

- Every device maintains a local **outbox** of pending changes.
- Server maintains a **change log** per org (append-only).
- Pull: client says "give me changes since cursor X".
- Push: client sends batched changes; server applies and returns assigned IDs / numbers.
- WebSocket pushes real-time notifications of remote changes.

### 16.2 `POST /v1/sync/push`

Batch of mutations. Atomic per record but not per batch.

```json
{
  "device_id": "uuid",
  "outbox": [
    {
      "client_op_id": "uuid",
      "entity": "invoice",
      "op": "create",
      "row_version": null,
      "payload": { ... },
      "client_timestamp": "2026-05-30T10:00:00+05:30"
    },
    {
      "client_op_id": "uuid",
      "entity": "item",
      "op": "update",
      "entity_id": "uuid",
      "row_version": 5,
      "payload": { "sale_price": "199.00" },
      "client_timestamp": "..."
    }
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "client_op_id": "uuid",
      "status": "applied",
      "server_id": "uuid",
      "server_assigned": { "invoice_no": "INV-0124" },
      "row_version": 1
    },
    {
      "client_op_id": "uuid",
      "status": "conflict",
      "server_row_version": 7,
      "server_payload": { ... },
      "conflict_id": "uuid"
    },
    {
      "client_op_id": "uuid",
      "status": "rejected",
      "error": { "code": "PERIOD_LOCKED", "message": "..." }
    }
  ],
  "server_cursor": "opaque-checkpoint"
}
```

### 16.3 `GET /v1/sync/pull`

```
GET /v1/sync/pull?since=cursor&entities=invoice,item&limit=500
```

Returns:
```json
{
  "changes": [
    {
      "entity": "invoice",
      "op": "upsert",
      "entity_id": "uuid",
      "payload": { ... },
      "row_version": 3,
      "server_timestamp": "..."
    },
    {
      "entity": "stock_ledger",
      "op": "insert",
      "entity_id": "uuid",
      "payload": { ... }
    }
  ],
  "next_cursor": "...",
  "has_more": false
}
```

### 16.4 `GET /v1/sync/conflicts`

List unresolved conflicts for current device or org.

### 16.5 `POST /v1/sync/conflicts/{id}/resolve`

```json
{ "resolution": "local_wins | remote_wins | merged", "merged_payload": { ... } }
```

### 16.6 `GET /v1/sync/state`

Server reports its current head cursor + counts to help client detect drift.

### 16.7 Conflict Rules (server enforces)

| Entity | Rule |
|--------|------|
| `items` (master) | Last-write-wins per field; conflict logged if both sides modified within 60 sec |
| `customers`, `vendors` | Same as items |
| `stock_ledger` | Append-only — no conflict possible |
| `invoices` (header) | First-to-server wins; second gets renumbered automatically and notification |
| `invoice_lines` | Tied to their invoice |
| `settings_kv` | Server-authoritative |
| `audit_log` | Append-only on server only |

---

## 17. WebSocket / Realtime

### 17.1 Connection

```
wss://api.counter.app/v1/realtime?token={jwt}&device_id={uuid}
```

After connect, server pushes events as JSON frames.

### 17.2 Event Shape

```json
{
  "event": "invoice.created",
  "org_id": "uuid",
  "entity_id": "uuid",
  "payload": { /* minimal — id, ref, summary */ },
  "by_device_id": "uuid",
  "by_user_id": "uuid",
  "server_timestamp": "...",
  "cursor": "opaque"
}
```

### 17.3 Event Catalog

| Event | Trigger |
|-------|---------|
| `invoice.created` | New posted invoice |
| `invoice.updated` | Invoice edited |
| `invoice.voided` | |
| `payment.received` | |
| `stock.changed` | Any stock_ledger entry |
| `item.updated` | Master changed |
| `customer.updated` | |
| `job_card.status_changed` | |
| `production_order.completed` | |
| `low_stock.alert` | Threshold crossed |
| `expiring_batch.alert` | |
| `device.added` | New device registered |
| `sync.conflict` | New conflict to resolve |
| `period.locked` | Owner locked a period |
| `settings.updated` | Owner changed settings |
| `notification.new` | In-app notification |

### 17.4 Client Subscribe / Unsubscribe

Default: client receives all org events. Client can filter:

```json
{ "type": "subscribe", "events": ["invoice.*", "stock.*"] }
```

### 17.5 Heartbeat

Server pings every 30 s. Client must `pong` within 10 s or connection drops; client auto-reconnects with backoff.

### 17.6 Failover

If WS disconnects, client falls back to long-poll on `GET /v1/sync/pull` every 30 s until WS restores.

---

## 18. Files & Media

### 18.1 `POST /v1/files/upload`

Multipart. Returns:
```json
{ "id": "...", "url": "https://...", "size_bytes": 123, "mime_type": "image/jpeg" }
```

Limits: 5 MB per file. Allowed types: image/* (jpg, png, webp), application/pdf.

### 18.2 `POST /v1/files/sign`

For direct-to-storage upload. Body: `{ "filename": "...", "mime_type": "..." }`. Returns presigned URL.

### 18.3 `DELETE /v1/files/{id}`

Permission-checked; tied to entity owning it.

### 18.4 Image Variants

Each uploaded image auto-resized to `original`, `large` (1600px), `medium` (800px), `thumb` (200px). Access via `?variant=medium`.

---

## 19. Backup & Restore

### 19.1 `POST /v1/backups`

Triggers a server-side snapshot of the org's data (in addition to client-side local backups). Async.

### 19.2 `GET /v1/backups`

List of available cloud backups for org.

### 19.3 `GET /v1/backups/{id}/download`

Returns signed URL. Owner-only, requires 2FA if enabled.

### 19.4 `POST /v1/backups/{id}/restore`

```json
{ "mode": "shadow|in_place", "confirmation_phrase": "I understand" }
```

`shadow` creates parallel org, `in_place` replaces. In_place requires Owner + 2FA + typed phrase.

### 19.5 `GET /v1/backups/{id}/verify`

Walks integrity, returns OK/CORRUPT.

---

## 20. Audit Log

### 20.1 `GET /v1/audit-log`

Filters: user_id, device_id, entity_table, entity_id, action, date_from, date_to, q.

Returns paginated entries with before/after JSON diff.

### 20.2 `GET /v1/audit-log/{id}`

Full entry.

### 20.3 `GET /v1/audit-log/export`

Async; returns job_id + downloadable encrypted PDF or CSV with audit trail.

---

## 21. Notifications

### 21.1 `GET /v1/notifications?unread=true`

In-app notifications for current user.

### 21.2 `POST /v1/notifications/{id}/read`

### 21.3 `POST /v1/notifications/mark-all-read`

### 21.4 `GET /v1/notifications/settings`

### 21.5 `PUT /v1/notifications/settings`

```json
{
  "events": {
    "invoice.paid": { "in_app": true, "email": true, "whatsapp": true, "sms": false },
    "low_stock.alert": { "in_app": true, "email": true }
  },
  "do_not_disturb": { "start": "21:00", "end": "08:00", "tz": "Asia/Kolkata" }
}
```

### 21.6 Push Tokens

`POST /v1/notifications/push-tokens` — register FCM / APNs token.
`DELETE /v1/notifications/push-tokens/{token}`

---

## 22. Settings

### 22.1 `GET /v1/settings`

Returns all org settings as nested object.

### 22.2 `PATCH /v1/settings`

Partial update. Validation per section. Returns changed keys.

### 22.3 `GET /v1/settings/{section}` — specific section.

### 22.4 `POST /v1/settings/period-lock`

```json
{ "lock_through_date": "2026-03-31", "reason": "Annual audit completed" }
```

Owner only.

### 22.5 `POST /v1/settings/period-unlock`

```json
{ "lock_id": "uuid", "reason": "..." }
```

### 22.6 Print Templates

`GET /v1/print-templates`
`GET /v1/print-templates/{id}`
`POST /v1/print-templates`
`PATCH /v1/print-templates/{id}`
`DELETE /v1/print-templates/{id}`
`POST /v1/print-templates/{id}/preview` — body: sample invoice id → returns rendered HTML.

### 22.7 Custom Fields

`GET /v1/custom-fields?entity=item`
`POST /v1/custom-fields`
`PATCH /v1/custom-fields/{id}`
`DELETE /v1/custom-fields/{id}` — only if no rows have values

---

## 23. Integrations

### 23.1 API Keys

`GET /v1/api-keys`
`POST /v1/api-keys`

```json
{ "name": "Tally export", "scopes": ["read:invoices", "read:purchases"], "expires_at": "2027-05-30" }
```

Response includes one-time secret (never retrievable again).

`POST /v1/api-keys/{id}/revoke`

### 23.2 Webhooks

`GET /v1/webhooks`
`POST /v1/webhooks`

```json
{
  "url": "https://example.com/hook",
  "events": ["invoice.created", "payment.received"],
  "secret": "auto-generated"
}
```

Webhook delivery: POST with body `{ event, payload, timestamp }`, header `X-Counter-Signature: hmac-sha256(secret, body)`. Retries with exponential backoff up to 24 hrs.

`POST /v1/webhooks/{id}/test`
`GET /v1/webhooks/{id}/deliveries?status=failed`

### 23.3 Tally Export

`POST /v1/integrations/tally/export?date_from=&date_to=` — returns Tally XML.

### 23.4 Zoho Books Export

`POST /v1/integrations/zoho/export?date_from=&date_to=` — returns CSVs.

### 23.5 Payment Gateways

`POST /v1/integrations/razorpay/link` — create payment link for an invoice.
`POST /v1/integrations/razorpay/webhook` — incoming callback.

---

## 24. Public / Verification

### 24.1 `GET /public/invoices/{hash}`

No auth. Returns minimal invoice data for verification (printed QR points here). Includes:
- Invoice no.
- Date
- Total
- Customer name (if any)
- Status (Valid / Voided)
- Verified hash match yes/no.

### 24.2 `GET /public/job-approval/{token}`

Customer approval page for job card estimates. Token is signed JWT.

### 24.3 `POST /public/job-approval/{token}/decision`

Customer accepts/rejects + optional signature image.

---

## 25. Health / Operational

### 25.1 `GET /v1/health`

Public. Returns `{ status: "ok", db: "ok", redis: "ok", version: "..." }`.

### 25.2 `GET /v1/system/version`

Min app versions, latest available app versions per platform.

### 25.3 `GET /v1/system/status`

Service component statuses.

### 25.4 `GET /v1/jobs/{id}`

Async job status.

```json
{ "id": "...", "type": "items_import", "status": "running", "progress": 0.42, "created_at": "...", "result": null, "error": null }
```

---

## 26. Data Contracts (Critical Shapes)

### 26.1 Invoice (full)

```json
{
  "id": "uuid",
  "org_id": "uuid",
  "branch_id": "uuid",
  "series_id": "uuid",
  "invoice_no": "INV-2025-26/0123",
  "invoice_date": "2026-05-30",
  "customer": {
    "id": "uuid|null",
    "name_snapshot": "...",
    "gstin_snapshot": "..."
  },
  "place_of_supply": "29",
  "salesperson_id": "uuid",
  "reference_no": "...",
  "totals": {
    "subtotal": "1000.00",
    "discount_total": "0.00",
    "taxable_total": "1000.00",
    "cgst": "90.00",
    "sgst": "90.00",
    "igst": "0.00",
    "cess": "0.00",
    "round_off": "0.00",
    "grand_total": "1180.00",
    "amount_paid": "1180.00",
    "balance_due": "0.00"
  },
  "status": "posted",
  "payment_status": "paid",
  "lines": [ {LineObject} ],
  "payments": [ {PaymentSummary} ],
  "audit": { "created_at": "...", "created_by": "uuid", "version": 1 },
  "invoice_hash": "sha256...",
  "signed_qr_data": "base64...",
  "irn": "...",
  "eway_bill_no": "..."
}
```

### 26.2 InvoiceLine

```json
{
  "id": "uuid",
  "line_no": 1,
  "item": { "id": "uuid", "sku_snapshot": "...", "name_snapshot": "..." },
  "description": "...",
  "hsn_code": "1234",
  "qty": "2.000",
  "unit_id": "uuid",
  "rate": "500.00",
  "mrp": "600.00",
  "discount_pct": "0.00",
  "discount_amt": "0.00",
  "taxable_amt": "1000.00",
  "tax_rate_id": "uuid",
  "gst_rate": "18.00",
  "cgst_amt": "90.00",
  "sgst_amt": "90.00",
  "igst_amt": "0.00",
  "cess_amt": "0.00",
  "total": "1180.00",
  "batch_id": "uuid|null",
  "location_id": "uuid",
  "is_free": false
}
```

### 26.3 Item (full GET)

```json
{
  "id": "uuid",
  "sku": "ITM-00123",
  "name": "Maggi 70g",
  "description": "...",
  "category_id": "uuid",
  "brand_id": "uuid",
  "hsn_code": "1902",
  "primary_unit_id": "uuid",
  "tax_rate_id": "uuid",
  "pricing": {
    "mrp": "12.00",
    "sale_price": "11.00",
    "purchase_price": "9.00",
    "tax_inclusive": true,
    "min_sale_price": "10.00",
    "max_discount_pct": "10.00"
  },
  "flags": {
    "track_inventory": true,
    "is_service": false,
    "is_batched": false,
    "allow_negative_stock": false,
    "has_variants": false
  },
  "stock_levels": {
    "reorder_level": "50.000",
    "reorder_qty": "200.000",
    "max_stock": "500.000",
    "lead_time_days": 7,
    "shelf_life_days": null
  },
  "barcodes": [ { "id": "uuid", "barcode": "8901234567890", "unit_id": "uuid", "is_primary": true } ],
  "alt_units": [ { "unit_id": "uuid", "conversion_factor": "12.0000" } ],
  "price_tiers": [ { "price_tier_id": "uuid", "min_qty": "10.000", "price": "10.50" } ],
  "current_stock": [
    { "location_id": "uuid", "qty": "120.000", "avg_cost": "9.10", "value": "1092.00" }
  ],
  "status": "active",
  "custom_fields": { "shelf_position": "A4" },
  "row_version": 5,
  "updated_at": "..."
}
```

---

## 27. Security Notes

- All endpoints over TLS 1.3.
- JWT signed with RS256; short-lived (15 min); refresh tokens rotated.
- Refresh tokens stored as hash on server.
- Sensitive endpoints (void, settings, user mgmt, restore) require re-auth or fresh token (< 5 min old).
- PII redacted in logs.
- Brute-force protection on auth endpoints (per-identifier and per-IP).
- CSRF: API is bearer-token, so CSRF not applicable; web admin (if any) uses double-submit cookies.
- Webhook signatures (HMAC-SHA256) prevent spoofing.
- File uploads scanned for malware (Phase 2).
- IP allowlist (org setting) optional.

---

## 28. SDK / Client Library Conventions

Official SDKs published for:
- JavaScript / TypeScript (used in web + Tauri client).
- Kotlin (Android companion).
- Swift (iOS companion).
- Python (data analyst / integration scripts).

All SDKs:
- Handle auth + refresh transparently.
- Maintain local outbox + sync state.
- Expose typed models matching the data contracts.
- Provide an offline-first builder pattern.

---

## 29. Versioning & Deprecation Policy

- Backward-compatible additions don't bump version.
- Breaking changes go to `/v2/` with old version maintained 12 months.
- 6-month deprecation notice via `Deprecation: true` and `Sunset: <date>` headers.
- Changelog at `https://docs.counter.app/changelog`.

---

## 30. Quick Endpoint Reference Card

| Resource | List | Create | Read | Update | Delete | Other |
|----------|------|--------|------|--------|--------|-------|
| Items | GET /items | POST /items | GET /items/{id} | PATCH /items/{id} | DELETE /items/{id} | lookup, import, export, bulk-price, stock, history |
| Customers | GET /customers | POST | GET {id} | PATCH | DELETE | lookup, ledger, statement, outstanding |
| Vendors | mirror of customers | | | | | |
| Invoices | GET /invoices | POST | GET {id} | PATCH | — | void, duplicate, pdf, thermal-html, send, verify |
| Credit Notes | GET | POST | GET {id} | — | — | void, pdf, send |
| Purchase Invoices | GET | POST | GET {id} | PATCH | — | void, pdf |
| Purchase Orders | GET | POST | GET {id} | PATCH | — | send, ack, cancel, convert, suggested |
| Stock Ledger | GET | — | — | — | — | (read-only) |
| Stock Adjustments | GET | POST | GET {id} | — | — | |
| Stock Transfers | GET | POST | GET {id} | — | — | receive |
| Batches | GET | (auto) | GET {id} | — | — | recall, force-expire |
| Job Cards | GET | POST | GET {id} | PATCH | — | status, parts, labor, photos, approval, convert |
| BOMs | GET | POST | GET {id} | PATCH | — | versions, activate, where-used |
| Production Orders | GET | POST | GET {id} | — | — | start, complete, cancel, cost-analysis |
| Payments | GET | POST | GET {id} | — | — | void, pdf |
| Expenses | GET | POST | GET {id} | PATCH | — | void |
| Users | GET | POST | GET {id} | PATCH | DELETE | suspend, reactivate, reset-pin, force-logout |
| Settings | GET | — | GET {section} | PATCH | — | period-lock/unlock |
| Backups | GET | POST | GET {id} | — | — | restore, verify, download |
| Audit Log | GET | (auto) | GET {id} | — | — | export |
| Sync | — | push | pull, state, conflicts | — | — | resolve |

---

*End of API specification.*
