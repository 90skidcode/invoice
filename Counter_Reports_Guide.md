# Counter Reports Guide

> How every report works, what data it uses, and what decisions it supports.

---

## Overview

Counter ships **31+ reports** across 6 categories. All reports are read-only views derived from transactional data — no report mutates any table. Every report is scoped to the authenticated org (`org_id` is injected on every query).

**Key files:**

| Layer | File |
|-------|------|
| Backend routes | `apps/api/src/routes/reports.ts` |
| Backend service | `apps/api/src/services/report.service.ts` |
| Frontend container | `apps/web/src/pages/reports/reports.tsx` |
| Shared UI helpers | `apps/web/src/pages/reports/shared.tsx` |
| Charts | `apps/web/src/pages/reports/charts.tsx` |

All API endpoints live under `/reports`, require a valid Bearer token, and return:

```json
{
  "ok": true,
  "data": { },
  "meta": { "request_id": "...", "server_time": "..." }
}
```

---

## 1. Sales Reports

**Frontend:** `apps/web/src/pages/reports/sales-report.tsx`
**Backend service functions:** `salesSummary`, `salesByItem`, `soapsByCustomer`, `salesByReferral`, `voidedBills`, `salesReturns`, `salesDiscounts`, `topCustomers`, `itemMargin`, `salespersonPerformance`, `categoryWiseSales` + day book (shared with financial)

**Primary tables:** `invoices`, `invoice_lines`, `customers`, `items`, `credit_notes`, `users`, `payments`

**Common filters:** `date_from`, `date_to` (ISO date strings). Optional item type filter (finished goods vs raw materials).

---

### 1.1 Summary

**Endpoint:** `GET /reports/sales/summary?date_from=&date_to=`

**Purpose:** Daily snapshot of revenue, GST collected, and cash actually received. This is the first screen an owner opens every morning to check yesterday's business.

**Data returned:**
- Totals: invoice count, taxable amount, CGST, SGST, IGST, grand total, amount collected
- Daily breakdown: date → count, grand total (for the chart)

**How it works:** Aggregates `invoices` where `status = 'posted'` and `invoice_date` is within range. Joins `payments` to compute how much was actually collected in that period.

---

### 1.2 By Item

**Endpoint:** `GET /reports/sales/by-item?date_from=&date_to=`

**Purpose:** Shows which products are selling. Used for demand planning and identifying slow-moving stock.

**Data returned:** Item name, HSN code, total quantity sold, total revenue, average selling rate.

**How it works:** Groups `invoice_lines` by `item_id`, sums `qty` and `amount`, joins `items` for name and HSN.

---

### 1.3 Soaps by Customer

**Endpoint:** `GET /reports/sales/soaps-by-customer?date_from=&date_to=`

**Purpose:** Business-specific report — shows sales of soap, bar, and bath products broken down by customer. Used by COCOGLO to track wholesale buyers of their soap range.

**How it works:** Filters `invoice_lines` where the joined `items.name` contains keywords `bar`, `soap`, or `bath` (case-insensitive). Groups by customer.

---

### 1.4 By Referral

**Endpoint:** `GET /reports/sales/by-referral?date_from=&date_to=`

**Purpose:** Tracks which referrer (existing customer) brought in how much business. Used to reward or measure referral channel effectiveness.

**How it works:** Joins `invoices → customers` and then `customers.referral_by_id → customers` (self-join) to attribute the invoice amount to the referring customer.

---

### 1.5 Voided Bills

**Endpoint:** `GET /reports/sales/voided?date_from=&date_to=`

**Purpose:** Audit trail of cancelled invoices. Helps identify patterns (specific staff, times of day, items) and prevent fraud.

**Data returned:** Invoice number, date, customer, amount, voided by whom, void reason.

**How it works:** Filters `invoices` where `status = 'voided'`.

---

### 1.6 Sales Returns

**Endpoint:** `GET /reports/sales/returns?date_from=&date_to=`

**Purpose:** Shows goods returned by customers. Affects GST liability (credit notes reduce output tax) and restores stock.

**Data returned:** Credit note number, original invoice reference, customer, items returned, amounts.

**How it works:** Queries `credit_notes` table joined with `invoice_lines` and `items`.

---

### 1.7 Discounts

**Endpoint:** `GET /reports/sales/discounts?date_from=&date_to=`

**Purpose:** Analyzes discounting behaviour by item. Useful for spotting excessive discounts or tracking promotional pricing.

**Data returned:** Item name, total quantity sold with discount, total discount amount, average discount %.

**How it works:** Groups `invoice_lines` by `item_id` where `discount_amt > 0`.

---

### 1.8 Top Customers

**Endpoint:** `GET /reports/sales/top-customers?date_from=&date_to=`

**Purpose:** Revenue ranking of customers. Supports relationship management — identify your top 10 accounts and ensure they're being looked after.

**Data returned:** Customer name, invoice count, total revenue, ranked descending.

**How it works:** Groups `invoices` by `customer_id`, sums `grand_total`, orders by sum descending.

---

### 1.9 Item Margin

**Endpoint:** `GET /reports/sales/margin?date_from=&date_to=`

**Purpose:** Gross profit analysis per item. Shows which products actually make money after cost of goods.

**Data returned:** Item name, quantity sold, revenue, estimated cost (qty × purchase price from `items.purchase_price`), gross profit, margin %.

**How it works:** Joins `invoice_lines` with `items` and computes `revenue - (qty × purchase_price)`. Uses `decimal.js` for all arithmetic.

---

### 1.10 Salesperson Performance

**Endpoint:** `GET /reports/sales/salesperson?date_from=&date_to=`

**Purpose:** Compares sales reps on revenue, invoice count, and average deal size. Used for commissions and performance reviews.

**Data returned:** User name, invoice count, total revenue, average invoice value.

**How it works:** Groups `invoices` by `created_by` (the logged-in user who created the invoice), joins `users`.

---

### 1.11 By Category

**Endpoint:** `GET /reports/sales/by-category?date_from=&date_to=`

**Purpose:** Revenue split by product category. Used for assortment planning — which category is the growth driver?

**Data returned:** Category name, revenue, quantity, % of total.

**How it works:** Joins `invoice_lines → items → categories`, groups by `category_id`.

---

### 1.12 Day Book

**Endpoint:** `GET /reports/financial/day-book?date_from=&date_to=`

**Purpose:** Chronological ledger of every transaction — sales, returns, purchases, payments in, payments out — for a given period. The equivalent of a traditional cash book.

**Data returned:** Date, transaction type, reference number, party name, amount, running indication of cash flow.

**How it works:** Unions `invoices`, `credit_notes`, `purchase_invoices`, and `payments` into a single chronological stream, sorted by date.

---

## 2. Purchase Reports

**Frontend:** `apps/web/src/pages/reports/purchase-report.tsx`
**Backend service functions:** `purchaseSummary`, `purchasesByVendor`, `purchasesByItem`, `vendorLedger`

**Primary tables:** `purchase_invoices`, `purchase_invoice_lines`, `vendors`, `items`, `payments`

---

### 2.1 Summary

**Endpoint:** `GET /reports/purchases/summary?date_from=&date_to=`

**Purpose:** Daily view of procurement spend and GST input paid. Mirrors sales summary for the purchase side.

**Data returned:** Totals (count, taxable, CGST, SGST, IGST, grand total, paid), daily breakdown.

---

### 2.2 By Vendor

**Endpoint:** `GET /reports/purchases/by-vendor?date_from=&date_to=`

**Purpose:** Shows how much was purchased from each supplier. Used for vendor negotiation and identifying dependency concentration.

**Data returned:** Vendor name, invoice count, total purchase value.

---

### 2.3 By Item

**Endpoint:** `GET /reports/purchases/by-item?date_from=&date_to=`

**Purpose:** Shows which raw materials or goods were purchased and in what quantities. Useful for cost analysis and comparing with production consumption.

**Data returned:** Item name, HSN, quantity purchased, total cost, average purchase rate.

---

### 2.4 Vendor Ledger

**Endpoint:** `GET /reports/purchases/vendor-ledger?date_from=&date_to=`

**Purpose:** Complete account statement per vendor — what was billed, what was paid, and the outstanding balance. Used before making payments to verify dues.

**Data returned:** Per vendor: total billed, total paid, balance outstanding, last transaction date.

**How it works:** Aggregates `purchase_invoices` for billed amount and `payments` (direction = `out`) for paid amount per vendor.

---

## 3. Manufacturing Reports

**Frontend:** `apps/web/src/pages/reports/manufacturing-report.tsx`
**Backend service functions:** `productionSummary`, `productionByItem`, `materialConsumption`

**Primary tables:** `production_orders`, `production_order_lines`, `items`

---

### 3.1 Production Summary

**Endpoint:** `GET /reports/production/summary?date_from=&date_to=`

**Purpose:** Overview of all production runs in the period — how many batches completed, total cost (materials + labour + overhead), and total goods produced.

**Data returned:** Run count, total material cost, labour cost, overhead cost, total production cost.

---

### 3.2 By Product (Finished Good)

**Endpoint:** `GET /reports/production/by-item?date_from=&date_to=`

**Purpose:** How much of each finished product was manufactured and at what cost per unit. Used to set or verify selling prices.

**Data returned:** Finished item name, total quantity produced, total cost, unit cost.

**How it works:** Groups `production_orders` by `finished_item_id`, sums costs and output quantities.

---

### 3.3 Material Consumption

**Endpoint:** `GET /reports/production/consumption?date_from=&date_to=`

**Purpose:** Shows which raw materials were consumed and in what quantities across all production runs. Used to reconcile with purchases and identify wastage.

**Data returned:** Raw material name, total quantity consumed, estimated value consumed.

**How it works:** Queries `production_order_lines` where `line_type = 'consume'`, groups by item.

---

## 4. GST Reports

**Frontend:** `apps/web/src/pages/reports/gst-report.tsx`
**Backend service functions:** `gstr1`, `gstrPurchase`, `gstr3bSummary`

**Primary tables:** `invoices`, `invoice_lines`, `purchase_invoices`, `purchase_invoice_lines`, `items`, `customers`

**Filter:** `period` in `YYYY-MM` format (e.g. `2026-05`).

> Tax rates are never hardcoded. All GST amounts are the actual values stored on the invoice at the time of billing, which reflect the rate that was active on the invoice date.

---

### 4.1 GSTR-1 (Sales)

**Endpoint:** `GET /reports/gst/gstr1?period=YYYY-MM`

**Purpose:** Outward supply return required by GST law. Submitted monthly to the GST portal. Splits invoices into B2B (registered customers with GSTIN) and B2C (unregistered) and provides HSN-wise taxable and tax summary.

**Data returned:**
- B2B section: GSTIN-wise invoices with taxable, CGST, SGST, IGST, CESS
- B2C section: Rate-wise summary
- HSN summary: HSN code, description, UQC, qty, taxable, tax by component

**How it works:** Filters `invoices` for the given month, joins `customers` to classify B2B vs B2C, groups `invoice_lines` by HSN.

---

### 4.2 Purchase GST (Input Credit)

**Endpoint:** `GET /reports/gst/purchase?period=YYYY-MM`

**Purpose:** Summary of GST paid on purchases — the Input Tax Credit (ITC) claimable against output tax. Needed to fill GSTR-3B.

**Data returned:** Total purchases, taxable amount, CGST paid, SGST paid, IGST paid, CESS paid.

---

### 4.3 GSTR-3B

**Endpoint:** `GET /reports/gst/gstr3b?period=YYYY-MM`

**Purpose:** Monthly self-assessed summary return. Reconciles output GST (from sales) against input credit (from purchases) to arrive at net tax payable or credit carried forward.

**Data returned:**
```
Output Tax (net of returns):   CGST / SGST / IGST / CESS
Input Tax Credit:              CGST / SGST / IGST / CESS
Net Payable / Credit:          CGST / SGST / IGST / CESS
```

**How it works:** Calls `gstr1` and `gstrPurchase` internally and subtracts ITC from output tax per component.

---

## 5. Stock & Inventory Reports

**Frontend:** `apps/web/src/pages/reports/stock-report.tsx`
**Backend service functions:** `stockValuation`, `lowStock`, `expiryReport`, `stockLedgerReport`, `locationWiseStock`

**Primary tables:** `stock_ledger`, `items`, `batches`, `locations`

> Stock quantities are always derived from `stock_ledger` — never from a cached column on `items`. See CLAUDE.md §1.2.

---

### 5.1 Stock Valuation

**Endpoint:** `GET /reports/stock/valuation`

**Purpose:** Current inventory value — useful for balance sheet, insurance, and cycle counting. Shows the worth of everything in stock at cost price and at selling price.

**Data returned:** Per item: current quantity on hand, purchase (cost) value, selling value, item type.

**How it works:** Sums `stock_ledger.qty_in - stock_ledger.qty_out` grouped by `item_id`, multiplied by `items.purchase_price` and `items.selling_price`.

---

### 5.2 Low Stock

**Endpoint:** `GET /reports/stock/low`

**Purpose:** Reorder alert. Lists every item where current stock has fallen at or below the configured reorder level. Used to trigger purchase orders before stockouts.

**Data returned:** Item name, current stock, reorder level, unit of measure.

**How it works:** Derives current stock from `stock_ledger`, compares to `items.reorder_level`.

---

### 5.3 Expiry

**Endpoint:** `GET /reports/stock/expiry?days_ahead=90`

**Purpose:** Lists batches that will expire within the specified window (default 90 days). Used to prioritise older stock in picking and flag items needing clearance pricing.

**Data returned:** Item name, batch number, batch quantity, expiry date, days remaining.

**How it works:** Queries `batches` where `expiry_date <= today + days_ahead` and batch still has stock on hand.

---

### 5.4 Stock Ledger

**Endpoint:** `GET /reports/stock/ledger?date_from=&date_to=&item_id=`

**Purpose:** Full movement history for one or all items — every receipt, sale, return, adjustment, transfer, and production entry. The audit trail for stock.

**Data returned:** Date, transaction type (purchase/sale/adjustment/transfer/production), reference number, qty in, qty out, running balance.

**How it works:** Reads `stock_ledger` directly, optionally filtered by `item_id`. Note: `stock_ledger` has no `deleted_at` — it is append-only, so there is no soft-delete filter here.

---

### 5.5 By Location

**Endpoint:** `GET /reports/stock/location`

**Purpose:** Shows how stock is distributed across warehouses, shop floor, and other locations. Used for inter-location transfer decisions.

**Data returned:** Location name → item name → quantity on hand.

**How it works:** Groups `stock_ledger` by `(location_id, item_id)`, sums qty_in - qty_out.

---

## 6. Financial Reports

**Frontend:** `apps/web/src/pages/reports/financial-report.tsx`
**Backend service functions:** `receivables`, `payables`, `paymentCollection`, `customerLedger`, `apAging`, `outstandingInvoices`, `profitAndLoss`

**Primary tables:** `invoices`, `purchase_invoices`, `payments`, `payment_allocations`, `customers`, `vendors`

---

### 6.1 AR Aging (Accounts Receivable)

**Endpoint:** `GET /reports/financial/receivables?as_of=YYYY-MM-DD`

**Purpose:** Shows how much money customers owe and for how long. Older buckets indicate collection risk. Used by owners to prioritise chasing overdue payments.

**Aging buckets:** Current (not yet due), 1–30 days, 31–60 days, 61–90 days, 90+ days.

**Data returned:** Per customer: total outstanding split across buckets.

**How it works:** Takes all `invoices` with `status = 'posted'` and `balance_due > 0` as of `as_of` date. Computes `as_of - due_date` to assign bucket.

---

### 6.2 Payables

**Endpoint:** `GET /reports/financial/payables`

**Purpose:** What is owed to vendors. Used before vendor payment runs to see the full picture of outstanding dues.

**Data returned:** Per vendor: total billed, total paid, outstanding balance.

---

### 6.3 Payment Collection

**Endpoint:** `GET /reports/financial/payment-collection?date_from=&date_to=`

**Purpose:** How much was collected and through which payment mode — cash, UPI, card, cheque, bank transfer, wallet. Used to reconcile the cash drawer and bank statement daily.

**Data returned:** Per date per payment mode: total collected.

**How it works:** Groups `payments` by `(txn_date, payment_mode)` where `direction = 'in'`.

---

### 6.4 Customer Ledger

**Endpoint:** `GET /reports/financial/customer-ledger?date_from=&date_to=`

**Purpose:** Account statement summary per customer — total billed, total paid, closing balance. Used when a customer disputes their account or when offering a statement.

**Data returned:** Per customer: billed, paid, balance.

---

### 6.5 AP Aging (Accounts Payable)

**Endpoint:** `GET /reports/financial/ap-aging?as_of=YYYY-MM-DD`

**Purpose:** Mirror of AR aging for the purchase side. Shows how overdue vendor payments are getting. Helps avoid late payment penalties and damaged supplier relationships.

**Aging buckets:** Same as AR: Current, 1–30, 31–60, 61–90, 90+.

---

### 6.6 Outstanding Invoices

**Endpoint:** `GET /reports/financial/outstanding?as_of=YYYY-MM-DD`

**Purpose:** Complete list of every unpaid or partially paid invoice, with days overdue. More granular than aging — shows individual invoices rather than customer totals.

**Data returned:** Invoice number, date, customer, invoice amount, paid amount, balance due, days overdue.

---

### 6.7 Profit & Loss

**Endpoint:** `GET /reports/financial/pl?date_from=&date_to=`

**Purpose:** Monthly P&L statement showing revenue, returns, cost of goods sold (via purchase amounts), gross profit, and gross margin %. This is the top-level financial health check.

**Data returned:** Per month:
- Revenue (sales grand total)
- Returns (credit notes total)
- Net revenue
- Purchases (cost of goods)
- Gross profit
- Gross margin %

**How it works:** Groups `invoices` and `credit_notes` for revenue/returns, `purchase_invoices` for COGS, per calendar month. Note: this is a gross profit P&L — it does not include operating expenses.

---

## Common Patterns

### Response Envelope

Every endpoint returns:
```json
{
  "ok": true,
  "data": { "...report specific..." },
  "meta": { "request_id": "uuid", "server_time": "ISO 8601" }
}
```

### Money Values

All monetary values in API responses are **strings** (e.g. `"12345.67"`), never floats. The frontend components (`<PriceDisplay>`, `<QuantityDisplay>`) handle formatting via the `decimal.js` library.

### Soft Delete Safety

All report queries exclude soft-deleted rows automatically (`deleted_at IS NULL`). The one exception is `stock_ledger`, which is append-only and has no `deleted_at` column.

### Multi-Tenancy

Every query has `org_id` in the WHERE clause — either injected by Drizzle middleware or explicitly added. No report ever returns data across org boundaries.

### Export

All reports support CSV export from the UI. The export is generated client-side from the fetched data using the Blob API — no separate export endpoint exists.

---

## Navigation

The reports tab is split into 6 main sections selectable via a top-level sub-tab toggle:

```
Reports
├── Sales         → 12 sub-reports
├── Purchases     →  4 sub-reports
├── Manufacturing →  3 sub-reports
├── GST           →  3 sub-reports
├── Stock         →  5 sub-reports
└── Financial     →  7 sub-reports
```

Each section has its own nested tab bar for switching between sub-reports without a page reload. Date pickers are shared across sub-reports within a section — changing the date range re-fetches the active sub-report.
