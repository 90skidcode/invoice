# Counter — Extended Screen Specifications (POS-Level Depth)

**Companion to** `Counter_BRD_FSD.md`
**Purpose:** Brings every operationally critical screen to the same depth as SCR-POS-01 — layout, fields, columns, hotkeys, keyboard flow, business logic, edge cases, validations, and error states.

---

## Table of Contents

1. SCR-DASH-01 — Dashboard / Home (Extended)
2. SCR-SAL-03 — Credit Note / Sales Return (Extended)
3. SCR-ITM-02 — Item Create / Edit (Extended)
4. SCR-CUS-02 — Customer Create / Edit (Extended)
5. SCR-PUR-01 — Purchase Entry (Extended)
6. SCR-PUR-02 — Purchase Order (Extended)
7. SCR-STK-01 — Stock Ledger View (Extended)
8. SCR-STK-02 — Stock Adjustment (Extended)
9. SCR-STK-03 — Stock Transfer (Extended)
10. SCR-STK-04 — Batch Management (Extended)
11. SCR-JOB-02 — Job Card Create / Edit (Extended)
12. SCR-MFG-01 — BOM Management (Extended)
13. SCR-MFG-02 — Production Order (Extended)
14. SCR-PAY-01 — Payments / Receipts (Extended)
15. SCR-EXP-01 — Expense Entry (Extended)
16. SCR-RPT-02 — GST Reports (Extended)
17. SCR-SET-01 — Settings (Fully expanded)
18. SCR-USR-01 — User Management (Extended)
19. SCR-AUD-01 — Audit Log Viewer (Extended)
20. SCR-BAK-01 — Backup / Restore (Extended)

---

## 1. SCR-DASH-01 — Dashboard / Home (Extended)

**Purpose:** Single-pane health check + quick launcher tuned per role.
**Roles:** All (role-filtered widgets).
**Layout grid:** 12-col responsive; collapses to 1-col under 720 px.

### 1.1 Layout Zones

| Zone | Position | Height | Contents |
|------|----------|--------|----------|
| Greeting strip | Top, full width | 56 px | "Good morning, Ravi • Counter 1 • Sync OK" + period selector dropdown |
| KPI row | Below greeting | 120 px | 4 KPI cards (configurable) |
| Charts row | Middle | 320 px | 2 charts side by side |
| Quick actions | Right column, sticky | full | New Sale (big), New Purchase, Add Item, Add Customer, Reports |
| Alerts panel | Below charts | auto | Low stock, expiring batches, overdue receivables, sync errors |
| Footer activity | Bottom | 200 px | Today's last 10 transactions, click → detail |

### 1.2 KPI Cards (per role default set)

| Role | Default Cards |
|------|---------------|
| Owner | Today's Sales, Today's Collection, Stock Value, Receivables |
| Admin | Today's Sales, Open Invoices, Low Stock Items, Pending POs |
| Cashier | My Sales Today, Bills Issued, Cash in Drawer, Last Bill |
| Stock Keeper | Stock Value, Items Below Reorder, Expiring 30 days, Pending GRN |
| Mechanic | Open Job Cards, Awaiting Parts, Ready for Delivery, My Bills Today |
| Accountant | Receivables, Payables, Today's GST Liability, Period Status |

### 1.3 KPI Card Anatomy

| Element | Description |
|---------|-------------|
| Label | Small caps, muted |
| Primary value | 28 px tabular-figure number |
| Comparison | Δ vs previous period with up/down arrow + colored % |
| Sparkline | Last 7 / 30 data points |
| Click | Drills to source report |

### 1.4 Chart Specifications

| Chart | Type | Default Range | Filter |
|-------|------|---------------|--------|
| Sales Trend | Line | Last 30 days | Daily / Weekly toggle |
| Top Items | Horizontal bar | Last 7 days | By qty / by value |
| Hourly Heatmap | Heatmap | Today | Compares to 4-week avg |
| Profit Trend | Area | Last 30 days | (Owner only) Cost vs Revenue |

### 1.5 Alerts Panel — Card Types

| Alert | Trigger | Action |
|-------|---------|--------|
| Low Stock | qty ≤ reorder_level | "Create PO" button |
| Expiring | expiry ≤ 30 days, qty > 0 | "Mark down" / "Run promo" |
| Overdue Receivable | due_date passed, balance > 0 | "Send reminder" (WhatsApp/SMS) |
| Sync Error | last sync > 5 min ago | "Retry sync" |
| Backup Missed | no backup in 24 hrs | "Backup now" |
| GST Filing Due | last day of GSTR-1 window | "Open GSTR-1" |

### 1.6 Hotkeys (Dashboard-specific)

| Key | Action |
|-----|--------|
| 1–9 | Trigger Nth quick action |
| R | Refresh KPIs |
| P | Change period |
| Esc | Close any opened drill |

### 1.7 Business Logic

- KPIs are computed from cached materialized views refreshed every 5 min (or on relevant write).
- Period selector cascades to all KPIs and charts on the page.
- "Today" uses org timezone, not device. Day boundary = configurable shift cutoff (e.g. 04:00) for shops that work past midnight.
- Empty state for first-time users: replace KPIs with "Get Started" cards (Add first item / Add first customer / Make first sale).

### 1.8 Performance Requirements

- First paint < 1 sec from app open.
- KPI numbers progressive: skeleton → cached → live (3 stages).
- Charts lazy-loaded (intersection observer).

### 1.9 Errors / Edge Cases

- Sync stale > 30 min: banner at top, dashboard still renders from local cache, all numbers tagged "Offline".
- Org with zero transactions: friendly empty state with onboarding nudges.
- Period contains period-lock boundary: small lock icon next to affected KPI.

---

## 2. SCR-SAL-03 — Credit Note / Sales Return (Extended)

**Purpose:** Reverse a posted invoice (full or partial), restore stock, refund or credit customer.
**Roles:** Owner, Admin, Cashier (with manager PIN for full void).
**Layout:** Mirror of POS with a top reference strip and a "What to return" picker.

### 2.1 Layout

- **Reference strip (72 px):** Original Invoice # (lookup), date of original, customer locked.
- **Return mode tabs:** *Full return* (auto-fill all lines), *Partial return* (line picker), *Damage / quality* (no stock back), *Price correction* (no qty change).
- **Body:** Standard line grid (same columns as POS) pre-filled.
- **Right pane:** Reason, refund mode, totals.

### 2.2 Header Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Credit note series | DROPDOWN | Y | active | last used | Separate series from invoices |
| Credit note no. | TEXT | Y | auto, gap-free | next | |
| CN date | DATE | Y | ≥ original, ≤ today | today | |
| Original invoice no. | LOOKUP | Y | must exist, not voided | — | Type-ahead by invoice no |
| Original date | DATE | N | auto from invoice | — | Read-only |
| Customer | LOOKUP | Y | from invoice | locked | Cannot change |
| Reason | DROPDOWN | Y | enum | — | Damaged / Wrong item / Customer cancel / Price correction / Quality issue / Other |
| Reason note | TEXT(255) | C | required if "Other" | — | |
| Refund mode | DROPDOWN | Y | enum | Cash | Cash / UPI / Bank / Adjust to ledger / Replacement |

### 2.3 Line Grid Behavior

- On selection of "Full return": all lines from original invoice copy with qty pre-filled, editable.
- On "Partial": all lines listed with qty 0 by default, user enters return qty (≤ original line qty − previously returned qty).
- On "Damage": same as partial but `restore_stock = false` flag set per line.
- On "Price correction": qty locked, rate editable; ledger entry net-out.

| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| Item code | LOOKUP | N | From original |
| Description | TEXT | N | snapshot from original |
| Original qty | NUM(14,3) | N | reference |
| Already returned | NUM(14,3) | N | cumulative |
| Return qty | NUM(14,3) | Y | ≤ original − already returned |
| Unit | DROPDOWN | N | from original |
| Original rate | NUM(14,2) | N | reference |
| Return rate | NUM(14,2) | Y | usually equal; for price correction differs |
| Disc % | NUM(5,2) | Y | inherited from original |
| GST% / Tax | NUM(4,2) | N | snapshot from original |
| Restore stock | BOOL | Y | true except for damage |
| Batch | LOOKUP | C | required if item.is_batched |
| Total | NUM(14,2) | N | computed |

### 2.4 Hotkeys

| Key | Action |
|-----|--------|
| F8 | Pick original invoice |
| F | Toggle Full / Partial mode |
| Space (on line) | Toggle "include this line" |
| F12 | Save + print |
| Esc | Cancel |

### 2.5 Business Logic

- On save: insert `credit_notes` + `credit_note_lines`.
- For each line where `restore_stock = true`, write **positive** `stock_ledger` entry with `txn_type = sales_return`, `ref_table = credit_note_lines`, `ref_id = line.id`, batch (if applicable) goes back to its original batch.
- Refund:
  - **Cash / UPI / Bank**: write `payments` row, `direction = outbound`, allocate to credit note via `payment_allocations`. Updates `bank_accounts.current_balance` for cash drawer.
  - **Adjust to ledger**: no payment row; credit note amount becomes available credit on customer's ledger. Auto-applies to oldest open invoice on save if org setting `auto_apply_credits = true`.
  - **Replacement**: link a new invoice; net zero financial impact; require a fresh invoice number assigned at same moment.
- Update parent `invoices.amount_paid` if refund came from already-collected money (decreases it).
- Update parent invoice status: if all qty returned → `fully_returned` status; partial → `partially_returned`.
- Tax: CN reverses exactly the same tax components as original line (CGST/SGST or IGST). Inter-state vs intra-state is locked to original invoice's place-of-supply, regardless of customer address changes.
- GST reporting: credit notes appear in GSTR-1 in their own section with reference to original invoice no.

### 2.6 Validations

- Cannot create CN for voided invoice.
- Cannot create CN for invoice in a period that is now locked (requires admin override + new entry in current period instead).
- Cannot return more than (original_qty − already_returned).
- CN date must be ≥ original invoice date.
- If batch was already expired / recalled and item is_batched: warn, require override permission.
- Sum of CN amount must equal sum of line totals + tax (no separate "refund extra" allowed; use expense for that).

### 2.7 Edge Cases

- Original invoice's customer was a walk-in (NULL customer_id): CN allowed only with refund mode = Cash/UPI/Bank, not Ledger.
- Batch from original is already fully consumed: line allows item return but new batch must be picked, or "no batch" flag set.
- Original used an inter-state tax (IGST) but customer has now moved within state: CN still uses IGST (locked to original).
- Returning a service item: `restore_stock` is moot; line still recorded for financial reversal.
- Partial refund + partial credit: split refund mode allowed; payment modal opens when refund mode = "Multiple".

### 2.8 Print

- CN prints with "CREDIT NOTE" header and "Against Invoice #XXX dated DD/MM/YYYY" reference line.
- Same templates as invoice (thermal + A4).

---

## 3. SCR-ITM-02 — Item Create / Edit (Extended)

**Purpose:** Complete master entry for everything sellable / purchasable / produceable.
**Roles:** Owner, Admin, Stock Keeper (price tab restricted from Stock Keeper unless permitted).
**Layout:** Tabbed page, save bar at bottom, dirty-state indicator. Cmd palette to jump tabs.

### 3.1 Tabs

| Tab | Visible When |
|-----|-------------|
| General | Always |
| Pricing | Always |
| Stock | Always (hidden if `track_inventory = false`) |
| Tax | Always |
| Barcodes | Always |
| Variants | If `has_variants = true` |
| Manufacturing | If profile = Manufacturer AND `is_finished_good = true` |
| Service | If `is_service = true` (workshop) |
| Custom Fields | If org has any custom item fields defined |

### 3.2 General Tab — Full Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| SKU / Item code | TEXT(40) | Y | unique per org, alnum + dash/underscore | auto from template `ITM-{seq:5}` | Editable |
| Item name | TEXT(160) | Y | non-empty | — | Used in search |
| Short name | TEXT(40) | N | — | first 40 of name | For thermal print where space tight |
| Description | TEXT(500) | N | — | — | Printed on A4 invoice |
| Category | LOOKUP | N | — | — | Quick-add inline |
| Sub-category | LOOKUP | N | filter by parent | — | |
| Brand | LOOKUP | N | — | — | |
| HSN / SAC code | TEXT(8) | C | numeric, 4/6/8 digits | from category default | Mandatory if GST registered |
| Primary unit | DROPDOWN | Y | — | PCS | |
| Image — Primary | IMG | N | ≤ 2 MB, jpg/png/webp | — | Auto-resized to 800px |
| Images — Additional | IMG × 4 | N | each ≤ 2 MB | — | Gallery |
| Track inventory | BOOL | Y | — | true | If false → no stock screens |
| Is service | BOOL | Y | — | false | Mutex with batched |
| Is batched | BOOL | Y | not service | false | Mutex with service |
| Allow negative stock | BOOL | N | only if track_inventory | inherit org | Item override |
| Status | DROPDOWN | Y | active/inactive/discontinued | active | |
| Has variants | BOOL | Y | — | false | Toggles Variants tab |
| Tags | MULTI-TEXT | N | — | — | Free-form, for grouping |
| Notes (internal) | TEXT | N | — | — | Not printed |

### 3.3 Pricing Tab

**Section 1 — Base Prices**
| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| MRP | NUM(14,2) | N | ≥ 0 | — | Printed; statutory in India |
| Default sale price | NUM(14,2) | Y | ≥ 0, ≤ MRP if MRP set | 0 | |
| Default purchase price | NUM(14,2) | N | ≥ 0 | 0 | Used in PO drafts |
| Price tax-inclusive | BOOL | Y | — | false | Org-wide default override |
| Min sale price | NUM(14,2) | N | ≥ purchase | — | Hard floor; user can't go below without override |
| Max discount % | NUM(5,2) | N | 0–100 | inherit org | Cashier can't exceed without manager PIN |

**Section 2 — Price Tiers (grid)**
| Tier | Unit | Min qty | Price | Effective from | Effective to |
|------|------|---------|-------|----------------|--------------|
| (e.g. Retail / Wholesale / Distributor — defined in Settings) | | | | | |

**Section 3 — Margin Display (computed)**
- Margin amount = sale − purchase
- Margin % = margin / purchase × 100
- After-tax margin (if tax-inclusive)

### 3.4 Stock Tab

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Opening stock (per location grid) | NUM(14,3) | N | ≥ 0 | 0 | Per location row |
| Opening rate | NUM(14,2) | C | ≥ 0; required if opening > 0 | last purchase price | For valuation |
| Opening as of date | DATE | C | ≤ today | FY start | |
| Reorder level | NUM(14,3) | N | ≥ 0 | 0 | Triggers alert |
| Reorder quantity | NUM(14,3) | N | ≥ 0 | 0 | Suggested PO qty |
| Max stock | NUM(14,3) | N | ≥ reorder | — | Optional ceiling |
| Lead time (days) | INT | N | ≥ 0 | 0 | For reorder calc |
| Shelf life (days) | INT | C | required if is_batched | — | Used to suggest expiry on production |
| Storage location | TEXT(60) | N | — | — | Bin / shelf reference |
| Weight (g) | NUM(10,2) | N | ≥ 0 | — | For courier / shipping |
| Dimensions L×W×H (cm) | TEXT(20) | N | — | — | |

### 3.5 Tax Tab

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Tax rate | DROPDOWN | Y | from tax_rates table | inherit category | E.g. GST 18% |
| Cess rate | NUM(5,2) | N | ≥ 0 | 0 | Sugary drinks, tobacco |
| ITC eligible | BOOL | Y | — | true | Input tax credit |
| Tax exempt | BOOL | Y | — | false | If true overrides tax rate |
| Reverse charge applicable | BOOL | Y | — | false | RCM items |

### 3.6 Barcodes Tab

| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| Barcode | TEXT(40) | Y | unique globally per org |
| Symbology | DROPDOWN | Y | EAN-13 / EAN-8 / UPC-A / Code-128 / Code-39 / Custom |
| Unit | DROPDOWN | Y | which packaging unit this barcode represents |
| Conversion to base | NUM(14,4) | N | auto from item_units |
| Is primary | BOOL | Y | exactly one row | |
| Print qty | INT | — | for "Print labels" action |
| Action | — | — | Delete row, Generate next (sequential), Print |

**Generate-next algorithm:** Read org setting `barcode_prefix` + last numeric suffix in this org's barcodes + 1, formatted to fixed length. Skip if generated value collides.

### 3.7 Variants Tab

- Define attributes: e.g. attribute_1 = "Size" with values ["S","M","L"]; attribute_2 = "Color" with values ["Red","Blue"].
- Click "Generate all variants" → produces N variant rows (6 in example).
- Each variant: variant SKU (auto), variant barcode, override price, override stock.
- Each variant becomes its own row in `item_variants` but shares parent for reporting roll-up.

### 3.8 Manufacturing Tab (FG only)

| Default BOM | LOOKUP | links to `boms` |
| Default batch size | NUM(14,3) | for production order suggestion |
| Production lead time (hrs) | INT | |
| Default expiry calc | rule: mfg_date + shelf_life_days | |

### 3.9 Service Tab (workshop)

| Default labor hours | NUM(6,2) |
| Hourly rate | NUM(14,2) |
| Skill required | DROPDOWN |
| Eligible mechanics | MULTI-LOOKUP |

### 3.10 Hotkeys

| Key | Action |
|-----|--------|
| Ctrl+S | Save |
| Ctrl+Shift+S | Save & Add Another |
| Ctrl+Tab | Next tab |
| Ctrl+Shift+Tab | Previous tab |
| Ctrl+B | Jump to Barcodes tab |
| Ctrl+P | Print labels for this item |
| Esc | Cancel (prompt if dirty) |

### 3.11 Business Logic

- On save: validate cross-tab rules (e.g. min_sale_price ≥ purchase_price).
- Opening stock writes a single `stock_ledger` entry per location with `txn_type = opening`, dated at opening date.
- Changing `track_inventory` from true → false: warn if any non-zero stock exists; require zero-out (adjustment) first.
- Changing `is_batched` from false → true: only allowed if zero on-hand stock; otherwise must adjust to zero first.
- SKU change: allowed but writes audit log; all transaction history still linked via item_id (UUID).
- Price change: writes a row to `item_price_history` for analytics.
- Image upload: client-side resize to 800px, compress to 80% jpg quality, then upload.

### 3.12 Validations & Errors

| Rule | Message |
|------|---------|
| SKU collision | "SKU already in use by item: {name}" |
| Barcode collision | "Barcode {code} already used by item: {name}" |
| HSN missing on GST-registered org | "HSN required for GST compliance" |
| Sale < Purchase | "Sale price below purchase — confirm?" (soft warn) |
| Sale < Min sale | "Sale price below minimum allowed (₹X). Override required." (hard) |
| Opening qty but no rate | "Enter opening rate for valuation" |

### 3.13 Bulk Operations from List

- **Import from Excel**: template with all general + pricing + tax columns; preview screen with row-level errors; commit only valid rows.
- **Bulk price update**: select items → set % up/down or fixed amount; preview diff; apply.
- **Bulk barcode print**: select items → quantity per item → preview sheet (A4 grid of labels or roll for thermal).

---

## 4. SCR-CUS-02 — Customer Create / Edit (Extended)

**Purpose:** Master record for B2C / B2B counterparty with credit and tax info.
**Roles:** Owner, Admin, Cashier (limited fields).

### 4.1 Tabs

| Tab | Notes |
|-----|-------|
| General | Identity + contact |
| Billing | Tax + addresses |
| Credit | Limits + terms |
| Pricing | Tier override, discount default |
| Loyalty | Points, tier, history (Phase 2) |
| Vehicles | Workshop profile only |
| Notes / Files | Free-form |

### 4.2 General Tab

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Customer code | TEXT(20) | Y | unique per org | auto `CUST-{seq:5}` | |
| Salutation | DROPDOWN | N | Mr/Mrs/Ms/Dr/M/s | — | "M/s" for businesses |
| Name | TEXT(120) | Y | non-empty | — | Legal name for B2B |
| Display name | TEXT(120) | N | — | = name | Short version for receipts |
| Type | DROPDOWN | Y | Individual / Business / Government | Individual | |
| Primary phone | TEXT(15) | Y | E.164 | — | Used as quick-search key |
| Alt phone | TEXT(15) | N | E.164 | — | |
| Email | TEXT(120) | N | RFC 5322 | — | For invoice email |
| WhatsApp number | TEXT(15) | N | E.164 | = primary phone | If different |
| Date of birth | DATE | N | < today | — | Loyalty + greetings |
| Anniversary | DATE | N | — | — | |
| Customer group | LOOKUP | N | — | inherit | Drives default tier & discount |
| Status | DROPDOWN | Y | Active / Inactive / Blocked | Active | |
| Source / channel | DROPDOWN | N | Walk-in / Referral / Online / Other | — | Marketing analytics |
| Tags | MULTI-TEXT | N | — | — | |

### 4.3 Billing Tab

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| GSTIN | TEXT(15) | C | regex, checksum | — | Required for B2B tax invoice |
| GST registration type | DROPDOWN | C | Regular / Composition / Unregistered / Consumer / SEZ / Overseas | Consumer | |
| PAN | TEXT(10) | N | regex | — | |
| Place of supply | DROPDOWN | Y | states + 97-Other Territory | from address state | Locks tax treatment |
| Billing address line 1 | TEXT(120) | N | — | — | |
| Billing address line 2 | TEXT(120) | N | — | — | |
| City | TEXT(60) | N | — | — | |
| State | DROPDOWN | Y | states | — | |
| Pincode | TEXT(10) | N | regex (6 digits IN) | — | |
| Country | DROPDOWN | Y | — | India | |
| Shipping = billing | BOOL | Y | — | true | If false, expose shipping fields |
| Shipping address (set) | (same fields) | C | — | — | |
| Distance from origin (km) | NUM(8,2) | N | — | — | E-way bill calculations |

### 4.4 Credit Tab

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Credit limit | NUM(14,2) | N | ≥ 0 | 0 | 0 = no credit |
| Credit days | INT | N | ≥ 0 | 0 | Used to compute invoice due_date |
| Interest rate (%) on overdue | NUM(5,2) | N | ≥ 0 | 0 | Phase 2 |
| Block on overdue | BOOL | Y | — | false | Hard-stop new sale if breached |
| Block on limit breach | BOOL | Y | — | false | Hard-stop sale if new bill takes balance > limit |
| Bypass approver | LOOKUP user | N | — | — | Whose PIN unblocks |
| Opening balance | NUM(14,2) | N | — | 0 | + receivable, − advance |
| Opening as of date | DATE | C | required if opening ≠ 0 | FY start | |
| Statement frequency | DROPDOWN | N | Never / Weekly / Monthly | Monthly | Auto WhatsApp/email |

### 4.5 Pricing Tab

| Default price tier | LOOKUP | from price_tiers |
| Default discount % | NUM(5,2) | applied per line at bill time |
| Tax treatment override | DROPDOWN | Inclusive / Exclusive / Inherit |
| Currency | DROPDOWN | INR (locked Phase 1) |

### 4.6 Vehicles Tab (Workshop)

Grid: Reg no., Make, Model, Year, Last service, Last reading.
Inline add / edit. Click row → opens vehicle full screen.

### 4.7 Notes / Files Tab

- Free-text running notes with timestamps (append-only).
- File attachments: ID proof, GST cert, agreement PDF (encrypted at rest).

### 4.8 Business Logic

- GSTIN entered → auto-extract state code (first 2 digits) and validate against `place_of_supply` (warn if mismatch).
- Phone uniqueness: warn on duplicate ("Existing customer: X. Merge?") but allow override (siblings, same number).
- Opening balance writes a `customer_ledger_opening` entry on save; immutable thereafter (changes require adjustment txn).
- Status change to `Blocked`: all new sales blocked at POS with message "Customer is blocked. Contact admin." Existing open invoices not affected.
- Save triggers customer-search index refresh (trigram).
- Delete (soft) only allowed if no transactions; otherwise force `Inactive` status.

### 4.9 Hotkeys

Ctrl+S Save, Ctrl+Shift+S Save & Add Another, Ctrl+L jump to Credit tab, Esc cancel.

### 4.10 Errors

| Rule | Message |
|------|---------|
| GSTIN invalid | "GSTIN checksum failed. Please verify." |
| GSTIN state ≠ place of supply | "GSTIN state does not match place of supply." (warn) |
| Opening balance ≠ 0 with no date | "Opening date required." |
| Credit limit breach blocked | "Credit limit (₹X) would be exceeded. Approver PIN required." |

---

## 5. SCR-PUR-01 — Purchase Entry (Extended)

**Purpose:** Record incoming goods + vendor invoice; impact stock and payables.
**Roles:** Owner, Admin, Stock Keeper.
**Layout:** Same skeleton as POS — header strip, line grid, totals panel, footer actions. Adds expanded batch/expiry per line.

### 5.1 Header Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Voucher series | DROPDOWN | Y | active | last used | Separate from sales |
| Voucher no. | TEXT | Y | auto, gap-free | next | |
| Voucher date | DATE | Y | ≤ today + (backdate window) | today | Org setting limits backdating |
| Vendor | LOOKUP | Y | active | — | Type-ahead; quick-create inline |
| Vendor invoice no. | TEXT(40) | Y | unique per vendor in org | — | Duplicate guard |
| Vendor invoice date | DATE | Y | ≤ voucher date, within FY | — | |
| Place of supply | DROPDOWN | Y | states | from vendor | Determines IGST vs CGST+SGST |
| Reverse charge | BOOL | Y | — | false | RCM treatment |
| Linked PO | LOOKUP | N | open POs for this vendor | — | Pulls lines |
| Receive location | LOOKUP | Y | active locations | default | Where stock lands |
| Goods received date | DATE | N | — | voucher date | If different from invoice |
| Transporter | TEXT(120) | N | — | — | |
| LR no. | TEXT(40) | N | — | — | |
| Vehicle no. | TEXT(20) | N | — | — | |
| E-way bill no. | TEXT(20) | N | numeric, 12 digits | — | If applicable |
| Notes | TEXT(255) | N | — | — | |

### 5.2 Line Grid Columns

| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| # | int | N | Serial |
| Item | LOOKUP/BARCODE | Y | Scan or type-ahead |
| Description | TEXT | Y | Auto-fill |
| HSN | TEXT(8) | N | Auto from item |
| Qty | NUM(14,3) | Y | Required > 0 |
| Free qty | NUM(14,3) | Y | Separate, no cost, no tax |
| Unit | DROPDOWN | Y | From item's UoM list |
| Rate (excl tax) | NUM(14,2) | Y | Vendor rate |
| Disc % | NUM(5,2) | Y | Per line |
| Disc amt | NUM(14,2) | Y | Mutex with % |
| Taxable | NUM(14,2) | N | Computed |
| GST% | NUM(5,2) | N | From item; editable for one-off |
| CGST/SGST/IGST amt | NUM | N | Computed by intra/inter |
| Cess | NUM | N | If applicable |
| Total | NUM | N | Computed |
| Batch no. | TEXT(40) | C | Required if item.is_batched |
| Mfg date | DATE | C | If batched |
| Expiry date | DATE | C | If batched and shelf_life set |
| MRP | NUM(14,2) | N | Updates item.MRP if changed |
| Location | LOOKUP | Y | Per-line location (defaults to header) |
| Update item cost | BOOL | Y | true = recompute moving avg |

### 5.3 Totals Panel

| Line | Computed |
|------|----------|
| Subtotal (taxable) | Σ taxable |
| Total discount | Σ line disc |
| CGST | Σ CGST |
| SGST | Σ SGST |
| IGST | Σ IGST |
| Cess | Σ cess |
| Other charges (freight, etc.) | manual entries |
| Round off | nearest ₹ |
| **Grand total** | sum |

**Other Charges grid** (separate from line items, not stock-impacting):
| Charge type | Amount | GST applicable | HSN/SAC | Notes |
|-------------|--------|----------------|---------|-------|
| Freight / Loading / Handling / Insurance / Other | NUM | BOOL | TEXT | TEXT |

### 5.4 Hotkeys

| Key | Action |
|-----|--------|
| F2 | New row |
| F3 | Vendor lookup |
| F8 | Link PO |
| F9 | Hold draft |
| F10 | Recall draft |
| F12 | Save |
| Ctrl+B | Jump to batch field of current line |
| Del | Remove current row |

### 5.5 Keyboard Flow

1. Pick vendor (F3 or type in field) → Enter.
2. Cursor to vendor invoice no., type → Enter → date.
3. Cursor to first line: scan barcode or type item → Enter.
4. Qty (default 1) → Tab → Rate → Tab → (if batched) batch no, mfg, expiry → Enter.
5. New row → repeat.
6. F12 → confirmation dialog if cost changed for any item → Save → optional print.

### 5.6 Business Logic

- **Duplicate guard:** UNIQUE on `(org_id, vendor_id, vendor_invoice_no)`. On save, exact match → block with reference to existing voucher.
- **Stock impact:** Each line writes a positive `stock_ledger` entry, `txn_type = purchase`, `ref_table = purchase_lines`, `ref_id = line.id`. Free qty: separate ledger entry with rate = 0, total value = 0, but qty included in stock.
- **Batch creation:** If `is_batched`, create `batches` row with `origin_type = purchase`, `origin_ref_id = line.id`, mfg/expiry from line.
- **Cost update:** If `Update item cost = true`, recompute moving average:
  `new_avg = ((current_stock_qty × current_avg) + (in_qty × in_rate)) / (current_stock_qty + in_qty)`
  Update `items.purchase_price` only if org setting allows.
- **Payables:** Write `vendor_ledger` entry; default `due_date = vendor_invoice_date + vendor.credit_days`. Voucher status = `unpaid` initially.
- **PO linkage:** If linked PO, update `purchase_orders.received_qty` per line, set PO status to `partial` or `closed` depending on remaining.
- **Tax determination:** Place of supply state code vs branch state code → intra (CGST+SGST) or inter (IGST). RCM checkbox flips tax to RCM accounting category.
- **Other charges:** Recorded as separate line in `purchase_lines` with `is_charge = true` flag; no stock impact; allocable to lines pro-rata or to a single line for cost accuracy (org setting).
- **Print:** Generates GRN (Goods Receipt Note), not a vendor invoice. Templates same as invoice templates with header "GRN / Purchase".

### 5.7 Validations

| Rule | Message |
|------|---------|
| Duplicate vendor invoice | "This vendor invoice already entered as voucher #XXX dated YYYY." |
| Backdate beyond limit | "Cannot enter purchase dated more than {N} days back. Org admin override required." |
| Period locked | "Period closed. Entry not allowed." |
| Expiry before mfg | "Expiry date must be after manufacture date." |
| Qty zero | "Quantity must be greater than zero." |
| Batched item no batch no. | "Batch number required for this item." |
| Rate drastically different from last | "Rate is {X}% different from last purchase. Confirm?" (soft warn) |

### 5.8 Edge Cases

- Vendor invoice in different state than vendor's primary address: use voucher's place_of_supply (header field), not vendor master.
- Item received was not in catalog: inline "+ Add new item" launches mini-create dialog (SKU, name, unit, HSN, GST, primary purchase price); on confirm, item created in background and continues line entry.
- Partial receipt against a PO: receive_qty per line less than PO qty; PO line shows remaining; PO status = partial.
- Free goods on a purchase invoice: enter in `free_qty` column; doesn't affect total, doesn't affect tax, but adds to stock at rate 0.
- Quantity in purchase unit different from base: rate is per purchase unit; base-unit qty in ledger = qty × conversion_factor.
- Returns against this purchase: handled via Debit Note (SCR-PUR-03).

---

## 6. SCR-PUR-02 — Purchase Order (Extended)

**Purpose:** Generate a formal order to vendor before goods arrive; track fulfillment.
**Roles:** Owner, Admin, Stock Keeper.

### 6.1 Layout

Identical skeleton to Purchase Entry; differences:
- No stock impact, no batch/expiry on lines.
- Status field prominent in header.
- "Convert to Purchase" button (F11).

### 6.2 Header Differences

| Field | Type | Mandatory | Notes |
|-------|------|-----------|-------|
| Expected delivery date | DATE | Y | |
| Quote / RFQ reference | TEXT(40) | N | If from a quote |
| Payment terms | DROPDOWN | N | Net 0/15/30/45/60/90/COD |
| Delivery terms | DROPDOWN | N | FOB / Ex-works / Delivered / Other |
| Status | DROPDOWN | Y | Draft / Sent / Acknowledged / Partial / Closed / Cancelled |

### 6.3 Actions

| Action | Hotkey | Effect |
|--------|--------|--------|
| Save Draft | Ctrl+S | Stays in Draft |
| Send | F8 | Email/WhatsApp PDF; status → Sent |
| Mark Acknowledged | F9 | Records vendor confirmation |
| Convert to Purchase | F11 | Opens Purchase Entry pre-filled |
| Cancel | Ctrl+Del | Status → Cancelled with reason |
| Close manually | — | Status → Closed; no further receipts |
| Print | Ctrl+P | A4 template |

### 6.4 Business Logic

- Auto-suggest from reorder rules: items where on-hand ≤ reorder_level grouped by primary vendor; user reviews and confirms.
- PO line tracks `qty_ordered`, `qty_received` (cumulative across linked purchase entries), `qty_pending` = ordered − received.
- Status transitions auto-managed: All lines fully received → Closed. Some lines received → Partial.
- Cancel reason mandatory, captured in audit log.
- PO never impacts stock or financial ledgers — purely a planning document.

---

## 7. SCR-STK-01 — Stock Ledger View (Extended)

**Purpose:** Forensic-grade view of every movement of an item / batch / location.
**Roles:** Owner, Admin, Stock Keeper, Accountant.

### 7.1 Layout

- **Filter strip (top, sticky):** Item (mandatory), Location, Batch, Date range, Movement type filters.
- **Summary cards (4):** Opening qty / In / Out / Closing qty (and value).
- **Ledger table (main):** Date-sorted, paginated, virtual scroll for >10k rows.
- **Right side panel:** Current item summary card (current stock, avg cost, last purchase rate, last sale rate).

### 7.2 Filter Bar

| Filter | Type | Default | Behavior |
|--------|------|---------|----------|
| Item | LOOKUP | required | trigram search |
| Location | MULTI-SELECT | All | Filters to chosen locations only |
| Batch | LOOKUP | All | Disabled if item not batched |
| Date range | DATE-RANGE | This month | Presets: Today / Yesterday / Last 7 / This month / Last month / FY / Custom |
| Movement types | MULTI-SELECT | All | Sale / Purchase / Return / Adj / Transfer / Production / Opening |
| Min qty change | NUM | — | Filter out tiny movements |
| Show value | BOOL | true | Toggle value columns |
| Show running balance | BOOL | true | Toggle balance column |

### 7.3 Summary Cards

| Card | Computed |
|------|----------|
| Opening | Balance at filter start date |
| Total In | Σ qty_in within range |
| Total Out | Σ qty_out within range |
| Closing | Opening + In − Out |
| Opening Value | Opening qty × cost at start |
| Closing Value | Sum of value column at end |

### 7.4 Table Columns

| Column | Width | Notes |
|--------|-------|-------|
| # | 40 | Auto |
| Date | 100 | DD-MM-YYYY HH:MM |
| Txn type | 100 | Color-coded badge |
| Voucher | 120 | Clickable → opens source doc |
| Party | 160 | Customer/vendor name |
| Location | 100 | |
| Batch | 100 | If filtered or shown |
| Mfg/Exp | 80 | Compact |
| In Qty | 90 | Right-aligned, green |
| Out Qty | 90 | Right-aligned, red |
| Rate | 90 | Tabular |
| Value | 100 | Computed |
| Running Qty | 100 | Bold |
| Running Value | 100 | |
| User | 90 | Who recorded |
| Device | 80 | Counter X |

### 7.5 Row Actions

- Click row → opens source document in side drawer.
- Right-click → "Copy", "View source", "Audit trail of this entry".
- Cmd/Ctrl+click → multi-select for export.

### 7.6 Hotkeys

| Key | Action |
|-----|--------|
| / | Focus filter |
| Ctrl+F | Find within current page |
| Ctrl+E | Export CSV |
| Ctrl+P | Print |
| ↑/↓ | Move selection |
| Enter | Open source doc |

### 7.7 Business Logic

- Query uses index `(org_id, item_id, location_id, txn_date DESC)`.
- Pagination cursor-based by (txn_date, id) for stable scroll.
- Running balance recomputed from filter start point — not just shown from stored value — so partial date filters are accurate.
- If user picks "All locations": running balance is per-(item+location), shown as a sum.
- Negative running qty highlighted red with warning icon.
- Stock value uses moving average at time of txn (stored per-row).

### 7.8 Export

CSV columns identical to table. Excel export adds summary section at top. Includes filter context in header rows.

### 7.9 Edge Cases

- Item never had a movement: empty state with "Adjust stock" CTA.
- Filter range starts before opening entry: shown as opening row anyway with adjusted balance.
- Very large dataset (>100k rows in range): warn + suggest narrower range; still allow with virtual scroll.
- Period lock crossed: lock icon between rows in different periods.

---

## 8. SCR-STK-02 — Stock Adjustment (Extended)

**Purpose:** Manual correction for damages, count variances, found goods, expiry write-offs.
**Roles:** Owner, Admin, Stock Keeper.

### 8.1 Header

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Voucher no. | TEXT | Y | auto | next | |
| Adjustment date | DATE | Y | ≤ today | today | |
| Location | LOOKUP | Y | active | default | |
| Reason | DROPDOWN | Y | enum | — | Damaged / Expired / Count variance / Found / Theft / Quality / Other |
| Reference doc | TEXT(60) | N | — | — | E.g. police FIR, internal memo |
| Reason note | TEXT(255) | C | required if Other | — | |
| Cost source | DROPDOWN | Y | Last purchase / Moving avg / Manual | Moving avg | How to value the adjustment |

### 8.2 Line Grid

| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| Item | LOOKUP | Y | |
| Current qty | NUM | N | Auto-shown after item pick |
| Adjust by (signed) | NUM(14,3) | Y | +/- |
| OR set to | NUM(14,3) | Y | absolute, computes signed delta |
| Unit | DROPDOWN | N | from item |
| Batch | LOOKUP | C | required if batched |
| Rate | NUM(14,2) | Y | depends on cost source |
| Value | NUM(14,2) | N | computed |
| Note | TEXT(120) | N | per-line reason |

### 8.3 Business Logic

- Per line writes `stock_ledger` entry: txn_type = adjustment, qty_in or qty_out based on sign, batch ref if any.
- Total positive adjustments and total negative adjustments shown separately in footer.
- If reason = "Expired" and batch is provided, batch.status set to `expired`; no further sales on that batch.
- If reason = "Theft" and value exceeds org-set threshold, mandatory approval flow (second-user PIN).
- Adjustment creates corresponding inventory write-off / write-on expense entry in `expenses` table for P&L accuracy.

### 8.4 Hotkeys & Errors

Ctrl+S Save, F3 New line, Del Remove line.
Errors: "Adjustment results in negative stock" (if not allowed); "Batch already expired"; "Reason required".

---

## 9. SCR-STK-03 — Stock Transfer (Extended)

**Purpose:** Move stock between branches / locations with optional in-transit state.
**Roles:** Owner, Admin, Stock Keeper.

### 9.1 Header

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Transfer no. | TEXT | Y | auto | next | |
| Date | DATE | Y | ≤ today | today | |
| From location | LOOKUP | Y | active | default | |
| To location | LOOKUP | Y | ≠ from | — | |
| Transfer mode | DROPDOWN | Y | Direct / In-transit | Direct | |
| Transporter | TEXT(120) | C | required if in-transit | — | |
| Vehicle no. | TEXT(20) | N | — | — | |
| Expected by | DATE | N | ≥ date | — | If in-transit |
| Reason | TEXT(255) | N | — | — | |

### 9.2 Lines

| Column | Notes |
|--------|-------|
| Item | required |
| Available at source | shown, read-only |
| Batch | required if batched |
| Qty | ≤ available |
| Unit | from item |
| Rate | from moving avg, read-only |

### 9.3 Status Flow

| Status | Triggers |
|--------|----------|
| Draft | On create until save |
| In Transit | Saved with mode = in-transit; ledger writes − at source, + at "Transit" pseudo-location |
| Received | User at destination marks as received; ledger writes − at transit, + at destination |
| Cancelled | If pending and not yet received; reverses source ledger |

For Direct mode: on save, two ledger entries per line (− source, + destination), status immediately `Received`.

### 9.4 Receive Screen

Separate compact UI accessible by destination users:
- List of incoming transfers (status `In Transit`).
- Pick transfer → see lines → tap "Receive All" or per-line received qty (if short).
- Discrepancy lines auto-create adjustment with reason "Transit loss".

### 9.5 Validations

- Cannot transfer more than available at source (override permission for back-order).
- From / To must differ.
- Item must exist in destination's allowed item list (org setting).
- Period lock applies.

---

## 10. SCR-STK-04 — Batch Management (Extended)

**Purpose:** View, search, and manage batches across all items.
**Roles:** Owner, Admin, Stock Keeper, Accountant (view).

### 10.1 Layout

Filter strip + table + side panel showing batch detail (movements, current locations, value).

### 10.2 Filters

| Filter | Type | Default |
|--------|------|---------|
| Item | LOOKUP | All |
| Status | MULTI | Active |
| Expiring in N days | INT | — |
| Expired | BOOL | false |
| Recalled | BOOL | false |
| Min qty | NUM | — |
| Location | MULTI | All |
| Mfg date range | DATE-RANGE | — |
| Expiry range | DATE-RANGE | — |

### 10.3 Columns

| Column | Notes |
|--------|-------|
| Batch no. | |
| Item | clickable |
| Mfg date | |
| Expiry date | colored by proximity |
| Days to expiry | computed |
| Original qty | from purchase / production |
| Current qty | from ledger |
| Locations | comma-separated if multi |
| Cost | per batch |
| Value | qty × cost |
| Status | Active / Expired / Recalled |
| Source | Purchase #X / Production #Y |

### 10.4 Row Actions

- View movements (drill to stock ledger filtered to this batch).
- Mark expired → forces adjustment writing off remaining qty.
- Recall → status → recalled; all sales of this batch blocked; auto-notify customers who purchased (Phase 2).
- Print batch label.

### 10.5 Business Logic

- Days-to-expiry computed daily by background job; alerts generated at 60/30/15/7 day thresholds.
- Recall is irreversible — recall reason logged; if customer-impact analysis enabled, query traces invoices containing this batch.
- Expiry color scale: > 90 days green, 30–90 amber, < 30 red, expired grey strikethrough.

---

## 11. SCR-JOB-02 — Job Card Create / Edit (Extended)

**Purpose:** Workshop's primary work-tracking document; precursor to an invoice.
**Roles:** Owner, Admin, Mechanic (limited tabs), Cashier (read for billing).

### 11.1 Tabs

| Tab | Always | Notes |
|-----|--------|-------|
| Details | Y | Customer, vehicle, schedule |
| Complaints | Y | What's wrong |
| Inspection | Y | Mechanic notes + photos |
| Parts & Labor | Y | What's being done |
| Approvals | Y | Customer sign-off |
| Photos | Y | Before / during / after |
| Convert | — | Once status = Ready |

### 11.2 Details Tab

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Job no. | TEXT | Y | auto | next | |
| Customer | LOOKUP | Y | active | — | Quick-add inline |
| Vehicle / Equipment | LOOKUP | C | required if profile = vehicle workshop | — | Filters by customer |
| Reg no. (manual) | TEXT(20) | C | if walk-in vehicle | — | When no master record |
| Reading in | NUM(14,2) | N | — | last reading | KM / hours |
| Reading unit | DROPDOWN | N | km/miles/hrs | KM | |
| Fuel level | DROPDOWN | N | E/Q/H/3Q/F | — | |
| Items left in vehicle | TEXT(255) | N | — | — | E.g. helmet, papers |
| Status | DROPDOWN | Y | enum | Open | Open / In Progress / Awaiting Parts / Awaiting Approval / Ready / Delivered / Cancelled |
| Priority | DROPDOWN | Y | Normal / High / Urgent | Normal | |
| Opened at | DATETIME | Y | auto | now | |
| Promised by | DATETIME | Y | ≥ opened_at | +24 hrs | |
| Assigned to | LOOKUP user | N | mechanics | — | |
| Service advisor | LOOKUP user | N | active | current user | |
| Source | DROPDOWN | N | Walk-in / Appointment / Insurance / Warranty | Walk-in | |

### 11.3 Complaints Tab

Grid of complaints (free-form):
| # | Reported by customer | Severity | Mechanic observation | Resolved | Resolved at |

- "+ Add Complaint" inline.
- Each can have linked photos.
- Severity: Low / Medium / High / Critical.

### 11.4 Inspection Tab (mechanic-filled)

| Section | Fields |
|---------|--------|
| Exterior | Damage notes, photo gallery |
| Interior | Notes, photos |
| Engine bay | Notes, photos |
| Tires | Per-wheel tread depth, pressure, condition |
| Fluids | Engine oil / coolant / brake / transmission — level, color |
| Lights & electrical | Functional checklist |
| Brakes | Front / rear pads, discs |
| Custom checklist | Pulled from org template |

### 11.5 Parts & Labor Tab — Two Grids

**Parts grid (consumed inventory):**
| Column | Notes |
|--------|-------|
| Item | LOOKUP, type item / scan barcode |
| Description | auto |
| Qty | required |
| Unit | from item |
| Batch | if batched |
| Rate | from item or vehicle's price tier |
| Disc | per line |
| GST% | snapshot |
| Total | computed |
| Status | Issued / Returned (unused) |
| Mechanic | who used it |

**Labor grid:**
| Column | Notes |
|--------|-------|
| Service | LOOKUP service items |
| Description | |
| Hours | NUM(6,2) |
| Rate / hr | from item |
| Disc | per line |
| GST% | snapshot |
| Total | computed |
| Mechanic | who performed |

**Right side totals:** Parts subtotal, Labor subtotal, Tax, Grand total estimate.

### 11.6 Approvals Tab

- Estimate snapshot — locked once shared.
- Approval modes:
  - **Verbal** — operator confirms; logs note.
  - **In-person signature** — customer signs on screen (touch) or paper; photo of signed paper attached.
  - **Remote** — WhatsApp shareable link with estimate; customer taps Approve / Reject; signed JWT response.
- Threshold setting: if estimate > ₹X, approval mandatory before further work.
- Approval audit: who/when/method/IP (if remote).

### 11.7 Photos Tab

- Three buckets: Before / During / After.
- Each photo: timestamp, mechanic, optional caption, geo (if mobile).
- All photos auto-attached to final invoice PDF (Phase 2).

### 11.8 Convert to Invoice

- Available when status = Ready or Delivered.
- One-click: creates invoice referencing this job card, all parts + labor lines copied with snapshots.
- Job card status → Delivered on successful invoice save.
- Subsequent additions blocked.

### 11.9 Status Flow

| From → To | Trigger | Side Effects |
|-----------|---------|--------------|
| (new) → Open | Save first time | Initial assignment notification |
| Open → In Progress | Mechanic starts work | Start timer for productivity metric |
| In Progress → Awaiting Parts | Item out of stock or external | PO suggestion appears |
| In Progress → Awaiting Approval | Estimate over threshold | Approval workflow triggered |
| Any → Ready | "Mark Ready" action | Customer notification (WhatsApp/SMS) |
| Ready → Delivered | Convert to invoice OR manual mark | Invoice generated |
| Any → Cancelled | Owner/Admin only | Reason mandatory; parts returned to stock |

### 11.10 Business Logic

- **Stock impact on Parts:** when status moves to In Progress, parts grid issued items write negative `stock_ledger` entries (txn_type = `job_card_consumption`). On Cancel, reverse entries.
- **Labor:** no stock impact, only billing.
- **Service reminders:** on Delivered, scheduled reminders created (next service due in X km / Y months).
- **Mechanic productivity metric:** time from In Progress → Ready × labor hours billed = utilization.
- **Insurance / Warranty:** if source = Insurance, additional fields appear: insurance company, claim no., approved amount, customer co-pay. Invoice splits payment between insurer and customer.

### 11.11 Hotkeys

| Key | Action |
|-----|--------|
| F2 | Add part line |
| F3 | Add labor line |
| F5 | Change status |
| F8 | Send WhatsApp approval link |
| F12 | Convert to invoice |
| Ctrl+S | Save |

### 11.12 Validations

- Cannot mark Ready if mandatory complaints unresolved.
- Cannot deliver if estimate > threshold and no approval recorded.
- Cannot convert to invoice if customer is blocked.

---

## 12. SCR-MFG-01 — BOM Management (Extended)

**Purpose:** Define and version recipes that map raw → finished goods.
**Roles:** Owner, Admin, Production Supervisor.

### 12.1 Layout

Header with FG selector + version selector; component grid; cost breakdown side panel.

### 12.2 Header Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| BOM name | TEXT(80) | Y | unique per FG | auto = FG name + suffix | |
| Finished good | LOOKUP | Y | items where is_finished_good | — | One BOM can produce one FG (+ byproducts) |
| Output qty | NUM(14,3) | Y | > 0 | 1 | Per "batch" of this BOM |
| Output unit | DROPDOWN | Y | from FG's UoM list | base | |
| Version | INT | Y | auto-increment | 1 | Multiple versions per FG |
| Effective from | DATE | Y | — | today | Versioning by date |
| Effective to | DATE | N | > from | — | Sunset old versions |
| Is active | BOOL | Y | — | true | |
| Yield % | NUM(5,2) | N | 0–100 | 100 | Expected output yield |
| Production lead time (hrs) | NUM(6,2) | N | — | — | |
| Notes | TEXT | N | — | — | |

### 12.3 Component Grid

| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| Sequence | INT | N | Auto |
| Item | LOOKUP | Y | Raw / WIP item |
| Qty per output | NUM(14,4) | Y | for `output_qty` units |
| Unit | DROPDOWN | Y | from item |
| Wastage % | NUM(5,2) | Y | adds to effective qty |
| Effective qty | NUM(14,4) | N | qty × (1 + wastage/100) |
| Current cost | NUM(14,2) | N | from item moving avg |
| Line cost | NUM(14,2) | N | effective qty × cost |
| Is byproduct output | BOOL | Y | reverse flow — produces this item |
| Notes | TEXT | N | — |

### 12.4 Cost Breakdown Panel

| Line | Value |
|------|-------|
| Σ raw input cost | sum of line costs where not byproduct |
| − Σ byproduct credit | sum where byproduct |
| Net cost per BOM batch | Σ inputs − Σ byproducts |
| Cost per output unit | net / output_qty |
| Suggested sale price | cost × (1 + margin %) from settings |

### 12.5 Business Logic

- A BOM is versioned. Production orders pick the version effective on their `mfg_date`.
- BOM cannot be deleted if any production order references it; instead set inactive / set effective_to.
- Editing an active BOM creates a NEW VERSION rather than modifying in place (forced for traceability). Force-edit allowed only by Owner with audit log.
- "Where used" inverse query: pick a raw item → see all BOMs that use it (for cost impact analysis).
- Recursive BOM allowed (BOM uses items that are themselves FGs of another BOM); cycle detection on save.

### 12.6 Hotkeys

Ctrl+S save (creates new version), Ctrl+D duplicate as new BOM, F8 jump to FG, Del remove line.

### 12.7 Validations

- Output qty > 0.
- At least one component line (non-byproduct).
- Effective_to (if set) > effective_from.
- No circular dependency.
- Component item must allow stock tracking.

---

## 13. SCR-MFG-02 — Production Order (Extended)

**Purpose:** Execute a BOM — consume raws, produce FG with batch.
**Roles:** Owner, Admin, Production Supervisor.

### 13.1 Layout

Header (BOM selector, output qty, batch info) → Inputs grid (auto from BOM, editable) → Outputs grid (FG + byproducts) → Cost panel → Status + actions.

### 13.2 Header Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Order no. | TEXT | Y | auto | next | |
| BOM | LOOKUP | Y | active BOMs | — | |
| BOM version | display | N | auto from effective | latest | Read-only |
| Output qty (planned) | NUM(14,3) | Y | > 0 | BOM output | |
| Output unit | DROPDOWN | N | from BOM | base | |
| Batch no. | TEXT(40) | Y | unique per item | auto: `{FG_code}-{YYMMDD}-{seq}` | Editable |
| Manufacture date | DATE | Y | ≤ today | today | |
| Expiry date | DATE | C | required if FG batched | mfg + shelf_life | |
| Source location | LOOKUP | Y | where raws consumed | default | |
| Output location | LOOKUP | Y | where FG lands | default | |
| Status | DROPDOWN | Y | Draft / In Progress / Done / Cancelled | Draft | |
| Started at | DATETIME | N | — | — | Set on In Progress |
| Completed at | DATETIME | N | — | — | Set on Done |
| Supervisor | LOOKUP user | N | — | current | |
| Notes | TEXT | N | — | — | |

### 13.3 Inputs Grid (auto from BOM × output_qty)

| Column | Notes |
|--------|-------|
| Item | from BOM |
| Qty planned | BOM.qty_per_output × this output qty × (1 + wastage) |
| Available at source | shown |
| Batch (consume) | LOOKUP available batches FIFO suggested |
| Qty actual | editable, defaults to planned |
| Unit | from BOM |
| Rate | from batch cost |
| Value | computed |
| Variance | actual − planned |

### 13.4 Outputs Grid

| Column | Notes |
|--------|-------|
| Item | FG + byproducts from BOM |
| Qty actual | editable (yield variance) |
| Unit | from BOM |
| Batch no. | for FG: from header; for byproducts: auto-generated |
| Mfg / Expiry | inherited |
| Cost allocation % | for byproducts: cost of co-products (default per BOM) |
| Effective unit cost | computed |

### 13.5 Cost Panel

| Line | Value |
|------|-------|
| Total input cost | Σ actual input values |
| − Byproduct cost credit | Σ byproduct allocations |
| Net cost for primary output | difference |
| Actual cost per output unit | net / actual output qty |
| Variance from planned | actual − BOM standard |

### 13.6 Status Flow & Side Effects

| Transition | Trigger | Side Effects |
|-----------|---------|--------------|
| Draft → In Progress | "Start" action | Reserves raw stock (no ledger entry yet); validates availability |
| In Progress → Done | "Complete" action | Writes ledger entries: negative for each input batch (qty_out at batch cost), positive for FG and byproducts (qty_in at computed cost); creates `batches` row for FG |
| → Cancelled | Cancel action | If In Progress, releases reservation; if Done, requires reversal entry (separate adjustment) |

### 13.7 Business Logic

- **FEFO/FIFO batch consumption:** default FIFO by mfg_date; user can override per line.
- **Yield variance:** if `actual_output / planned_output < yield_threshold`, alert generated.
- **Cost flow:** actual production cost is computed from inputs actually consumed, not planned. This gives true unit cost for the FG batch.
- **Multi-level BOMs:** if input is itself an FG, system suggests producing it first; option to "Auto-create child production orders" for unavailable intermediates.
- **Quality hold:** optional setting requires QC pass before status moves to Done; QC user signs off.

### 13.8 Hotkeys

| Key | Action |
|-----|--------|
| Ctrl+S | Save (stays in Draft) |
| F8 | Start (Draft → In Progress) |
| F12 | Complete (In Progress → Done) |
| Ctrl+Del | Cancel |
| F4 | Print batch label |

### 13.9 Validations

- Inputs available at source ≥ qty actual.
- Output batch no. unique for FG.
- Expiry ≥ mfg.
- Status transitions linear and one-way (except cancel reversal).
- Cannot complete with zero output qty.

### 13.10 Edge Cases

- Power cut mid-completion: order remains In Progress, no ledger written; restart cleanly.
- Raw shortage discovered mid-production: switch status back to Awaiting Materials → create PO from order screen → resume when received.
- Over-production: actual > planned allowed (no error); variance recorded.
- Wastage exceeds expected: alert at 2x BOM wastage assumption.

---

## 14. SCR-PAY-01 — Payments / Receipts (Extended)

**Purpose:** Record money in/out outside of a sale moment (e.g. customer pays old invoice).
**Roles:** Owner, Admin, Cashier (receipts), Accountant.

### 14.1 Layout

Top tabs: **Receipt** (inbound) | **Payment** (outbound) | **Contra** (bank transfer).
Below: form panel (left) + allocation panel (right).

### 14.2 Receipt Form Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Voucher no. | TEXT | Y | auto | next | |
| Date | DATE | Y | ≤ today | today | |
| Customer | LOOKUP | Y | active | — | |
| Amount | NUM(14,2) | Y | > 0 | — | |
| Mode | DROPDOWN | Y | Cash / Card / UPI / Bank / Cheque | Cash | |
| Bank account | LOOKUP | C | if non-cash | default | |
| Reference no. | TEXT(40) | C | UTR/cheque/auth/UPI ref | — | |
| Reference date | DATE | N | — | = date | |
| Discount given | NUM(14,2) | N | ≥ 0 | 0 | Settlement discount |
| Write-off | NUM(14,2) | N | ≥ 0 | 0 | Small balance |
| Narration | TEXT(255) | N | — | — | |

### 14.3 Allocation Panel

| Column | Notes |
|--------|-------|
| Invoice no. | All open invoices for this customer |
| Invoice date | |
| Amount | original |
| Already received | |
| Outstanding | computed |
| Apply | NUM editable, ≤ outstanding |
| Allocate all (BTN) | auto-distribute by FIFO |

Running counter at bottom: **Allocated: ₹X / Receipt amount: ₹Y / Unallocated: ₹Z** (Z goes to customer's advance balance).

### 14.4 Payment Form

Same structure with `direction = outbound`, party type = vendor, allocates against open purchase invoices.

### 14.5 Contra (Bank-to-Bank Transfer)

| From account | LOOKUP | Y |
| To account | LOOKUP | Y; ≠ from |
| Amount | NUM | Y |
| Date | DATE | Y |
| Reference | TEXT | N |

No party. Two `bank_accounts` balance updates; one `payments` row marked `is_contra = true`.

### 14.6 Business Logic

- Save creates one `payments` row + N `payment_allocations` rows.
- For each allocated invoice: update `invoices.amount_paid`, recompute `balance_due`, recompute `payment_status` (unpaid/partial/paid).
- Unallocated amount goes to "Advance" ledger of customer; visible in customer ledger.
- Cash mode updates Cash account `current_balance`; bank modes update respective bank account.
- Cheque mode: status defaults to `pending`; allocations don't apply until bank-cleared (separate "Cheque Clearing" screen Phase 2). Cleared cheques bookmark date for cash flow.
- Discount given: writes a small adjustment entry; reduces invoice outstanding without paying.
- Write-off: writes off remaining balance as bad debt expense (org setting).
- Voucher voided → reverses all linked allocations and re-opens invoices' outstanding.

### 14.7 Hotkeys

Ctrl+S Save, Ctrl+A Allocate all, F8 Customer search, ↑↓ traverse allocations.

### 14.8 Validations

- Allocated > receipt amount → error.
- Bank required for non-cash.
- Reference required for card / UPI / cheque.
- Customer must not be blocked... (actually allow — taking money from blocked customers is fine).

---

## 15. SCR-EXP-01 — Expense Entry (Extended)

**Purpose:** Record overhead and operating expenses outside of purchase invoices.
**Roles:** Owner, Admin, Accountant.

### 15.1 Layout

Single form + receipt photo upload + tax breakup section.

### 15.2 Fields

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Voucher no. | TEXT | Y | auto | next | |
| Expense date | DATE | Y | within FY | today | |
| Category | LOOKUP | Y | active | — | Hierarchical |
| Sub-category | LOOKUP | N | filter by parent | — | |
| Description | TEXT(255) | Y | — | — | |
| Vendor | LOOKUP | N | active | — | If applicable |
| Amount (excl tax) | NUM(14,2) | Y | > 0 | — | |
| GST applicable | BOOL | Y | — | false | |
| GST rate | DROPDOWN | C | if GST applicable | — | |
| GST amount | NUM(14,2) | N | computed | — | Editable for one-off |
| Total amount | NUM(14,2) | Y | excl + GST | computed | |
| ITC eligible | BOOL | C | if GST applicable | inherit from category | Input tax credit |
| Payment mode | DROPDOWN | Y | Cash/Card/UPI/Bank/Cheque/Unpaid | Cash | |
| Bank account | LOOKUP | C | if non-cash | default | |
| Reference no. | TEXT(40) | C | — | — | |
| Receipt image | IMG | N | ≤ 5MB | — | Photo or scan |
| Reimbursable? | BOOL | N | — | false | If staff incurred |
| Reimburse to user | LOOKUP | C | if reimbursable | — | |
| Recurring? | BOOL | N | — | false | E.g. rent |
| Recurrence | DROPDOWN | C | Weekly/Monthly/Quarterly/Yearly | Monthly | |
| Project / Cost center | LOOKUP | N | — | — | Phase 2 |
| Notes | TEXT | N | — | — | |

### 15.3 Business Logic

- Writes `expenses` row + corresponding `payments` row (if paid immediately).
- ITC-eligible expenses appear in GSTR-3B input credit section.
- Recurring expenses: scheduler generates draft entries on each cycle for review and post (org setting auto-post true/false).
- Reimbursable expenses: create a payable to staff member (not as payroll, just credit balance).
- Category drives default ITC eligibility (e.g. rent ITC eligible, employee welfare not).
- Category drives default account: rent → "Rent Expense" account, etc.

### 15.4 Validations

- Total = excl + GST within ₹1 tolerance.
- GST required if applicable.
- ITC-eligible requires vendor GSTIN.

---

## 16. SCR-RPT-02 — GST Reports (Extended)

**Purpose:** Statutory GST return preparation, validation, and government-format export.
**Roles:** Owner, Admin, Accountant.

### 16.1 Layout

Top: tab strip per return type. Each tab: filter strip (period) + summary cards + section navigator + data table + export panel.

### 16.2 Tabs

| Tab | Description |
|-----|-------------|
| GSTR-1 | Outward supplies |
| GSTR-3B | Summary return + tax payment |
| GSTR-2A / 2B | Inward supplies reconciliation (pulled from GSTN) — Phase 2 |
| HSN Summary | HSN-wise outward summary |
| B2C Summary | B2C consolidated |
| ITC Ledger | Input tax credit register |
| E-Invoice Status | IRN generation tracker — Phase 2 |

### 16.3 GSTR-1 Sub-Sections

| Section | Code | Content |
|---------|------|---------|
| B2B | 4A, 4B, 4C, 6B, 6C | Invoices to registered persons |
| B2C (Large) | 5A, 5B | Inter-state B2C > ₹2.5 lakh |
| B2C (Small) | 7 | All other B2C, consolidated |
| Exports | 6A | With/without payment of tax |
| Credit/Debit Notes (Registered) | 9B | |
| Credit/Debit Notes (Unregistered) | 9B | |
| Nil Rated / Exempted | 8 | |
| HSN Summary | 12 | |
| Documents Issued | 13 | Series, range, cancelled count |

### 16.4 Period Selector

| Field | Type | Default |
|-------|------|---------|
| Period type | DROPDOWN | Monthly / Quarterly | Monthly |
| Month/Quarter | DROPDOWN | Last completed period |
| Financial year | DROPDOWN | Current FY |

### 16.5 Summary Cards (GSTR-1)

| Card | Value |
|------|-------|
| Total invoices | count |
| Taxable value | Σ |
| CGST | Σ |
| SGST | Σ |
| IGST | Σ |
| Cess | Σ |
| Validation issues | count (clickable, drills to error list) |

### 16.6 Validation Panel

Pre-flight checks before export:

| Check | Severity | Action |
|-------|----------|--------|
| B2B invoice with missing GSTIN | Error | Open invoice to fix |
| B2B invoice with invalid GSTIN checksum | Error | |
| Place of supply mismatch (intra/inter wrong tax) | Error | |
| HSN code missing on lines (turnover ≥ threshold) | Error | |
| Tax amount mismatch (recomputed ≠ stored) | Warning | |
| Invoice in series with gap | Warning | Document gap |
| Voided invoices included | Info | Listed under section 13 |

### 16.7 Tables (per section)

Standard columns appropriate to the section. Example for B2B:

| Column | Notes |
|--------|-------|
| GSTIN of recipient | |
| Recipient name | |
| Invoice no. | |
| Invoice date | |
| Invoice value | |
| Place of supply | |
| Reverse charge | |
| Invoice type | Regular / SEZ / Deemed Export |
| E-Commerce GSTIN | if via marketplace |
| Rate | per line |
| Taxable value | |
| CGST/SGST/IGST/Cess | per line |

Each row expandable to show invoice lines.

### 16.8 Export Panel

| Format | Use Case |
|--------|----------|
| JSON | Direct upload to GST portal |
| Government Excel (offline tool) | Validation via govt tool |
| CSV per section | Custom analysis |
| Summary PDF | Internal records |

Each export checksums the data and records the export in `gst_export_log` with filer name, timestamp, period.

### 16.9 GSTR-3B Specific

Sections 3.1 (outward supplies), 3.2 (inter-state to unregistered), 4 (eligible ITC), 5 (exempt/nil rated inward), 6 (payment of tax). Cards: tax payable, ITC available, net cash outflow.

### 16.10 Business Logic

- Returns are computed from `invoices`, `credit_notes`, `expenses` (ITC), `purchase_invoices` (ITC) using period and place_of_supply.
- Tax recomputed on the fly using `tax_rates` effective on each invoice date — handles mid-year rate changes correctly.
- Once exported and submitted (manual flag), period becomes "filed" and is read-only for filing purposes; corrections in next period via amendments.
- "What changed since last view" indicator if invoices modified after last open of the report.

### 16.11 Hotkeys

Ctrl+E export, Ctrl+P print summary, V validate, ←→ switch sections.

### 16.12 Errors

| Issue | Message |
|-------|---------|
| No invoices in period | Empty state with "Last filed period: X" |
| Validation errors present | Block export with red badge; require resolve or explicit override |
| Tax rates not defined for period | "Tax rates missing — update Settings → Tax" |

---

## 17. SCR-SET-01 — Settings (Fully Expanded)

**Purpose:** All org-level configuration.
**Roles:** Owner (all), Admin (most).
**Layout:** Left rail with section list + main content area per section + Save bar (sticky at bottom of each section).

### 17.1 Section Index

| # | Section | Description |
|---|---------|-------------|
| 1 | Organization | Identity, GST, address |
| 2 | Branches | Multi-branch setup |
| 3 | Locations | Stock locations per branch |
| 4 | Devices & Counters | Registered installs |
| 5 | Invoice Series | Numbering schemes |
| 6 | Invoice & Print Templates | Look + print rules |
| 7 | Tax Rates | GST rate management |
| 8 | Units of Measure | UoM master |
| 9 | Categories & Brands | Item taxonomy |
| 10 | Price Tiers | Wholesale / Retail etc. |
| 11 | Payment Modes | Cash / Card / UPI / Bank |
| 12 | Bank Accounts | Org's accounts |
| 13 | Printers | Connected printers per device |
| 14 | Barcode Settings | Format, label size |
| 15 | Notifications | Channels + templates |
| 16 | WhatsApp / Email Templates | Message bodies |
| 17 | Security | PIN / 2FA / session |
| 18 | Backup | Local + cloud |
| 19 | Sync | Server URL, channels |
| 20 | Integrations | Razorpay, Tally, SMS |
| 21 | Industry Profile | Toggle modules |
| 22 | Localization | Language, formats |
| 23 | Financial Year & Period Locks | Period control |
| 24 | Custom Fields | Add fields to entities |
| 25 | Approval Workflows | Discount / void approvers |
| 26 | API Keys & Webhooks | Developer access |
| 27 | About & Updates | Version, changelog |

### 17.2 Organization Section

(See Customer Create for similar field shape — name, GSTIN, PAN, state, address, phone, email, logo, currency, FY start month, timezone, plan, signature image.)

Save bar with "Discard / Save" buttons.

### 17.3 Invoice Series Section

Grid of series with columns: name, prefix, current next number, FY scope, branch, is_default, is_active, actions.

Per-row edit modal:
| Field | Type | Mandatory | Notes |
|-------|------|-----------|-------|
| Series name | TEXT(40) | Y | "Main", "Estimate" |
| Document type | DROPDOWN | Y | Invoice / Estimate / Credit Note / Purchase / Payment / Job Card / Production / Adjustment / Transfer |
| Prefix | TEXT(10) | N | e.g. "INV-" |
| Suffix | TEXT(10) | N | e.g. "/2025-26" |
| Number padding | INT | Y | 4 → "0001" |
| Starting number | INT | Y | First number ever |
| Current next | INT | N | display, editable by Owner only |
| Reset on FY | BOOL | Y | true = restart each FY |
| Branch scope | LOOKUP | N | null = all branches |
| Active | BOOL | Y | |

### 17.4 Tax Rates Section

Grid: name, total %, cgst, sgst, igst, cess, effective from/to, active.

Per-row create/edit:
- Set all rate components (auto-distribute if user enters total).
- Effective dates control historical vs current invoice computation.
- "Bulk apply to items" action: pick items, change rate, optionally back-date.

### 17.5 Invoice & Print Templates Section

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| Default A4 template | DROPDOWN | "Standard" | List installed templates |
| Default thermal 80mm | DROPDOWN | "Standard 80" | |
| Default thermal 58mm | DROPDOWN | "Standard 58" | |
| Show company logo | BOOL | true | |
| Show signature image | BOOL | false | |
| Show terms & conditions | BOOL | true | Editable T&C text |
| T&C text | TEXTAREA | template | |
| Show MRP column | BOOL | true | A4 only |
| Show HSN column | BOOL | true | A4 only |
| Show savings (MRP − sale) | BOOL | true | Retail love |
| Include UPI QR | BOOL | true | Generated per invoice |
| Include verification QR | BOOL | true | Signed URL |
| Round-off rule | DROPDOWN | Nearest rupee | Nearest / Up / Down / None |
| Amount in words | BOOL | true | Statutory in India |
| Auto-print on save | BOOL | true | |
| Auto-print copies (A4) | INT | 1 | |
| Auto-print copies (thermal) | INT | 1 | |
| Print receipt-only summary | BOOL | true (thermal) | Hide tax breakup on thermal |
| Show GSTIN of customer | BOOL | true | B2B |

Live preview pane on right showing sample data rendered with current settings.

### 17.6 Printers Section

Per device:
| Printer label | Type (A4 / thermal58 / thermal80) | Connection (USB / Bluetooth / LAN / IP) | Address | Is default for type | Test Print button |

### 17.7 Barcode Settings

| Setting | Value |
|---------|-------|
| Default symbology | EAN-13 / Code-128 / ... |
| Auto-generate barcode on item create | BOOL |
| Prefix (for internal codes) | TEXT(4) |
| Label size | DROPDOWN: 50×25mm, 60×30mm, 75×40mm, A4 grid |
| Label content | CHECK: Item name / Price / Barcode / SKU / MRP / Date |
| Roll printer | LOOKUP from printers |

### 17.8 Notifications Section

Per event type, channel selection:
| Event | In-app | Email | WhatsApp | SMS |
|-------|--------|-------|----------|-----|
| Invoice paid in full | ☑ | ☑ | ☑ | ☐ |
| Payment received | ☑ | — | ☑ | — |
| Low stock alert | ☑ | ☑ | ☐ | ☐ |
| Expiring batch | ☑ | ☑ | ☐ | ☐ |
| Sync error | ☑ | ☑ | ☐ | ☐ |
| Approval requested | ☑ | — | ☑ | ☐ |
| Job card ready | ☐ | — | ☑ | ☑ |
| Statement (monthly) | ☐ | ☑ | ☑ | ☐ |

Per channel, time-window (e.g. don't send WhatsApp after 9 PM), and digest preferences (immediate / hourly / daily).

### 17.9 Security Section

| Setting | Type | Default |
|---------|------|---------|
| PIN length | INT | 4 |
| PIN complexity | DROPDOWN | Numeric only / Alphanumeric |
| PIN expiry days | INT | 90 (0 = never) |
| Force change on first login | BOOL | true |
| Failed attempts before lock | INT | 5 |
| Lockout duration (min) | INT | 60 |
| Session idle timeout (min) | INT | 30 |
| Force re-auth for sensitive ops | BOOL | true (void, settings, user mgmt) |
| 2FA enabled (org-wide) | BOOL | false |
| 2FA required for roles | MULTI | Owner, Admin |
| IP whitelist | LIST | empty (any) |

### 17.10 Sync Section

| Setting | Value |
|---------|-------|
| Server URL | https://sync.counter.app or self-host |
| Org sync token | (read-only, regenerate button) |
| Last sync at | timestamp |
| Sync direction | Push & Pull / Push only / Pull only / Paused |
| Conflict resolution | Auto / Manual review |
| Bandwidth budget (MB/day) | optional cap |
| Sync interval (sec) | 30 default |
| Compress payload | BOOL true |

### 17.11 Industry Profile Section

| Module | Toggle | Locked by Profile? |
|--------|--------|---------------------|
| Workshop / Job Cards | ☐ | Recommended for workshop |
| Manufacturing / BOM | ☐ | Recommended for manufacturer |
| Loyalty | ☐ | |
| Distributor pricing | ☐ | Recommended for distribution |
| Multi-branch | ☐ | |
| E-invoicing | ☐ | Required if turnover > threshold |

### 17.12 Financial Year & Period Locks

- FY start date.
- Current FY display.
- Locked periods grid: from → to, locked by, locked at, reason.
- "Close period through DD-MM-YYYY" action (Owner only).
- Unlock: requires reason + audit log entry.

### 17.13 Custom Fields

Per entity (Item / Customer / Vendor / Invoice / Job Card / etc.):
| Field name | Field type (text/num/date/dropdown/boolean) | Mandatory | Default | Visible on print |

Up to 10 custom fields per entity. Stored in `custom_fields` JSONB column on the entity.

### 17.14 Approval Workflows

| Operation | Threshold | Approver Role(s) |
|-----------|-----------|------------------|
| Discount > X% | X | Admin / Owner |
| Sale at < cost | — | Owner |
| Void posted invoice | — | Owner |
| Stock adjustment > Y value | Y | Admin / Owner |
| Negative stock override | — | Admin |
| Sale beyond credit limit | — | designated user |
| Job card without approval > Z | Z | Admin |

### 17.15 API Keys & Webhooks

- Generate API keys for read-only / read-write / full access.
- Webhook endpoints: register URL + events to subscribe + secret (HMAC).
- Test webhook button.

### 17.16 Save Behavior

- Save bar shows dirty count: "3 unsaved changes — Save / Discard".
- All saves write `audit_log` row with before/after diff.
- Some settings (sync URL, FY start) require explicit confirmation modal.

---

## 18. SCR-USR-01 — User Management (Extended)

**Purpose:** Create and manage user accounts and access.
**Roles:** Owner; Admin (cannot edit Owner).

### 18.1 Layout

User list table + Create button → modal/full-page form.

### 18.2 List Columns

| Column | Notes |
|--------|-------|
| Avatar | initials |
| Name | |
| Username / Phone | |
| Role | badge |
| Branch access | "All" or count |
| Last login | timestamp |
| Status | Active / Suspended / Locked |
| Actions | Edit, Suspend, Reset PIN, View activity |

### 18.3 Create / Edit Form

| Field | Type | Mandatory | Validation | Default | Notes |
|-------|------|-----------|------------|---------|-------|
| Full name | TEXT(120) | Y | — | — | |
| Username | TEXT(40) | C | unique, alnum + underscore | from name | If using username login |
| Phone | TEXT(15) | Y | E.164, unique per org | — | Login key |
| Email | TEXT(120) | N | RFC | — | For password reset, notifications |
| Role | DROPDOWN | Y | enum | Cashier | Owner / Admin / Cashier / Stock / Mechanic / Accountant / Viewer |
| Branch access | MULTI-LOOKUP | Y | branches | current branch | |
| Default branch | DROPDOWN | Y | from access list | first | Login lands here |
| Initial PIN | TEXT | C | length per setting | last 4 of phone | Hidden after save |
| Force PIN change on first login | BOOL | Y | — | true | |
| Is salesperson | BOOL | Y | — | role-dependent | For attribution |
| Commission % | NUM(5,2) | N | — | 0 | Salesperson reward (Phase 2) |
| Status | DROPDOWN | Y | Active / Suspended | Active | |
| Notes (admin only) | TEXT | N | — | — | |
| 2FA enabled | BOOL | N | — | inherit org | |

### 18.4 Permission Overrides

Below the standard role permissions, a list of toggles for fine-grained overrides:
- Can apply discount > X% without approval
- Can void invoices
- Can view profit/cost data
- Can edit master prices
- Can access dashboard
- Can run reports
- Can export data
- Etc.

Each override defaults to role's matrix value; user-specific override stored in `permissions_override` table.

### 18.5 Actions on Existing User

| Action | Effect |
|--------|--------|
| Reset PIN | Admin sets new PIN, user must change on next login |
| Suspend | Cannot log in; existing sessions terminated |
| Reactivate | |
| View activity | Audit log filtered to this user |
| Force logout (all devices) | Invalidates sessions |
| Delete | Soft delete; only if no transactions tied; else suggests Suspend |

### 18.6 Validations

- Phone unique within org.
- Owner role can only exist for one user per org (the registered owner). Adding another with Owner role transfers ownership (confirmation required).
- Cannot suspend yourself.
- Cannot remove your own access to all branches.

---

## 19. SCR-AUD-01 — Audit Log Viewer (Extended)

**Purpose:** Forensic, read-only access to every change.
**Roles:** Owner, Admin, Accountant (view only).

### 19.1 Layout

Filter strip + table with virtualized scroll + side detail panel showing diff.

### 19.2 Filters

| Filter | Type | Default |
|--------|------|---------|
| User | LOOKUP | All |
| Device | LOOKUP | All |
| Date range | DATE-RANGE | Today |
| Entity type | MULTI | All (Invoice, Item, Customer, Setting, User, etc.) |
| Entity ID | TEXT | — | Search specific record |
| Action | MULTI | All (create, update, delete, void, login, logout, permission_change, export) |
| Severity | MULTI | All |
| Free text | TEXT | — | Searches in before/after JSON |

### 19.3 Table Columns

| Column | Notes |
|--------|-------|
| When | DD-MM HH:MM:SS |
| User | Name |
| Device | Counter X |
| IP | |
| Entity | "Invoice INV-0123" |
| Action | badge: green=create, blue=update, red=delete/void |
| Summary | "Changed amount: 1200 → 1500" |
| Reason | for void / adjustments |

### 19.4 Detail Panel (Right)

Selected row expands to show:
- Full before JSON
- Full after JSON
- Side-by-side diff with highlights
- Related audit entries (same user, same minute, same entity)
- Source document link if applicable

### 19.5 Business Logic

- Read-only — no edit or delete actions exposed in UI.
- Underlying table is partitioned by month; queries that span partitions automatically scoped.
- Search uses GIN index on the JSONB columns for full-text within payloads.
- Export to CSV with all filtered rows; encrypted PDF option for evidentiary use.

### 19.6 Retention

- Default 7 years (configurable per org).
- Automatic monthly partition drop after retention.
- Pre-drop, export auto-archives to cold storage if cloud backup enabled.

### 19.7 Hotkeys

/ filter, ↑↓ navigate, Enter open detail, Ctrl+E export.

---

## 20. SCR-BAK-01 — Backup / Restore (Extended)

**Purpose:** Protect against device loss, corruption, ransomware. Build user trust.
**Roles:** Owner, Admin.

### 20.1 Layout

Top: status cards. Middle: backup history. Bottom: restore section.

### 20.2 Status Cards

| Card | Value |
|------|-------|
| Last local backup | timestamp + "X min ago" |
| Last cloud backup | timestamp + cloud destination |
| Local backup size | last snapshot in MB |
| Local snapshots count | "96 / 96 (24 hrs window)" |
| Cloud quota used | "12 / 100 MB" |
| Next scheduled backup | next time |

### 20.3 Local Backup Settings

| Field | Type | Default |
|-------|------|---------|
| Auto-backup enabled | BOOL | true |
| Interval (min) | INT | 15 |
| Retention (snapshots) | INT | 96 (= 24 hrs at 15 min) |
| Storage path | TEXT | %appdata%/Counter/backups |
| Encrypt backups | BOOL | true |
| Backup password | TEXT | derived from device key + org code |

### 20.4 Cloud Backup Settings

| Field | Type | Notes |
|-------|------|-------|
| Provider | DROPDOWN | Google Drive / OneDrive / Dropbox / S3 / iCloud |
| Auth status | display | Connect / Reconnect button |
| Folder path | TEXT | "Counter/{org}/" |
| Daily backup time | TIME | 02:00 local |
| Retention (days) | INT | 90 |
| WiFi only | BOOL | true |
| Status | display | Healthy / Failing |

### 20.5 Manual Actions

| Action | Effect |
|--------|--------|
| Backup now (local) | Creates immediate snapshot |
| Backup now (cloud) | Uploads latest snapshot to cloud |
| Export portable backup | Single encrypted file user can save anywhere |
| Verify integrity | Walks last backup, checks checksums |
| Restore from local | Picks snapshot from list |
| Restore from cloud | Browse cloud folder |
| Restore from file | Upload an exported file |

### 20.6 Restore Flow (extra careful)

1. User picks source.
2. App computes diff: "This restore would change X items, Y invoices, Z customers."
3. Choose mode:
   - **Shadow restore (recommended)**: spawn parallel "Counter Sandbox" org; user can verify before swap. Live org untouched.
   - **In-place restore**: full destructive replace. Requires Owner PIN + typed confirmation phrase ("I understand").
4. Pre-restore snapshot taken automatically (rollback option).
5. Restore executes; audit log entry "RESTORE_PERFORMED".
6. App restarts; sync re-initializes.

### 20.7 Backup Snapshot Contents

| Component | Included |
|-----------|----------|
| SQLite DB | ✅ |
| Local outbox (unsynced) | ✅ |
| Settings JSON | ✅ |
| Print templates | ✅ |
| Custom field definitions | ✅ |
| Item images | ✅ (compressed) |
| Invoice PDFs cache | ❌ (regenerable) |
| App logs | ❌ |
| User session tokens | ❌ |

### 20.8 Encryption

- AES-256-GCM at rest.
- Key derived from device hardware ID + org master key.
- Cloud backups additionally encrypted with org master password (separate from user PIN).
- Master password recovery: requires 2 of 3 secrets (Owner email OTP + phone OTP + recovery codes).

### 20.9 Errors & Edge Cases

| Issue | Behavior |
|-------|----------|
| Disk full | Stop auto-backup; alert immediately; suggest cloud-only |
| Cloud auth expired | Banner; re-auth flow |
| Cloud upload failing 3x | Switch to weekly mode + alert |
| Corrupt backup detected | Mark invalid, hide from restore list |
| Restore from different schema version | Run migration; if downgrade, refuse |

### 20.10 Hotkeys

Ctrl+B backup now, Ctrl+R restore (with full confirm flow).

---

*End of extended screen specifications.*
