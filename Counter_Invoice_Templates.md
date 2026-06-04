# Counter — Invoice Templates

**Companion to** `Counter_BRD_FSD.md`
**Purpose:** Self-contained invoice templates that work for both **thermal printers (58mm / 80mm)** and **A4 sheet**, function offline, and can be opened anywhere — no app required, no internet needed, no external CSS or JS, no CDN.

---

## 1. Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Self-contained** | Single HTML file. All CSS inline in `<style>`. No external fonts, no `<link>` to CDNs, no `<script src>`. |
| **Offline-first** | Logo embedded as base64. QR codes embedded as inline SVG. System fonts only. |
| **Multi-paper from one file** | CSS `@page` directives + body class swap layouts for A4 / 80mm / 58mm. |
| **Print-perfect** | Tabular numerics, monochrome-safe, ≥ 10pt readable, no page-break-inside on lines. |
| **Statutorily complete** | Includes all GST-compliant fields, HSN, amount in words, place of supply, IRN/QR placeholder. |
| **Customer-friendly** | UPI QR for instant payment, verification QR for authenticity. |
| **Localizable** | Pre-rendered server-side per template language; UI character set covers Devanagari, Tamil, Telugu, Kannada, Bengali, Malayalam, Gujarati, Punjabi via system fonts. |
| **Renderable to PDF** | Browser "Save as PDF" works identically. Server can use Puppeteer / wkhtmltopdf for batch. |
| **Shareable** | Single file fits in WhatsApp Documents, email attachment, USB stick. |

## 2. Two Rendering Paths

There are **two complementary outputs** for an invoice. Both should be supported.

| Path | Use For | Format |
|------|---------|--------|
| **A. Standalone HTML** | A4 print, thermal print, PDF generation, email/WhatsApp share, customer self-view in browser | One HTML file with embedded CSS/SVG |
| **B. Direct ESC/POS** | Bare-metal thermal print on attached USB/Bluetooth/LAN printer | Binary command sequence sent to printer |

Path A is the universal, customer-shareable artifact. Path B is the fastest path for in-shop printing because it bypasses the OS print dialog and any HTML→raster conversion.

The app uses **A** for sharing/email/PDF and the same **A** rendered to thermal paper for browser-based printing; **B** when a physical thermal printer is directly attached and the operator hits "Print" with auto-print enabled.

---

## 3. Placeholder Syntax

Templates use **Mustache-style** placeholders: `{{placeholder}}` for values, `{{#section}}…{{/section}}` for repeating blocks, `{{^section}}…{{/section}}` for negated/empty sections.

The renderer can be:
- Server-side (Node.js with `mustache` or `handlebars`).
- Client-side (Tauri/Capacitor JS, one inline `<script>` substitutes from a JSON blob — only used for rendering, not for application logic, so it doesn't break the standalone promise).
- Plain string-replace (simplest, language-agnostic).

After substitution the file remains a single HTML document with no remaining `{{}}` markers.

### 3.1 Full Placeholder Catalog

**Organization (seller):**
| Placeholder | Source | Notes |
|-------------|--------|-------|
| `{{org.name}}` | organizations.name | |
| `{{org.legal_name}}` | organizations.name | Legal name same unless different captured |
| `{{org.tagline}}` | settings.invoice.tagline | Optional sub-line under name |
| `{{org.gstin}}` | organizations.gstin | |
| `{{org.pan}}` | organizations.pan | |
| `{{org.state}}` | organizations.state | |
| `{{org.state_code}}` | organizations.state_code | |
| `{{org.address}}` | organizations.address | Full address |
| `{{org.phone}}` | organizations.phone | |
| `{{org.email}}` | organizations.email | |
| `{{org.logo_base64}}` | derived | data: URL of logo |
| `{{org.signature_base64}}` | derived | optional signature image |
| `{{org.upi_id}}` | bank_accounts (default UPI) | For UPI QR generation |

**Branch:**
| `{{branch.name}}` | branches.name | If multi-branch |
| `{{branch.address}}` | branches.address | |
| `{{branch.phone}}` | branches.phone | |
| `{{branch.gstin}}` | branches.gstin | If different from org |

**Invoice:**
| Placeholder | Source |
|-------------|--------|
| `{{invoice.no}}` | invoices.invoice_no |
| `{{invoice.date}}` | invoices.invoice_date (formatted dd-mm-yyyy) |
| `{{invoice.date_iso}}` | invoices.invoice_date (ISO) |
| `{{invoice.due_date}}` | invoices.due_date |
| `{{invoice.series_name}}` | invoice_series.name |
| `{{invoice.reference_no}}` | invoices.reference_no |
| `{{invoice.place_of_supply}}` | invoices.place_of_supply |
| `{{invoice.place_of_supply_name}}` | derived from state_code |
| `{{invoice.salesperson}}` | users.name |
| `{{invoice.notes}}` | invoices.notes |
| `{{invoice.terms}}` | invoices.terms |
| `{{invoice.copy_label}}` | "Original" / "Duplicate" / "Triplicate" |
| `{{invoice.irn}}` | invoices.irn |
| `{{invoice.eway_bill_no}}` | invoices.eway_bill_no |
| `{{invoice.is_intra_state}}` | computed boolean |
| `{{invoice.is_void}}` | boolean |
| `{{invoice.print_count}}` | invoices.print_count |
| `{{invoice.hash}}` | invoices.invoice_hash |
| `{{invoice.verify_url}}` | derived |

**Customer:**
| `{{customer.name}}` | invoices.customer_name_snapshot |
| `{{customer.address}}` | invoices.billing_address_snapshot |
| `{{customer.shipping_address}}` | invoices.shipping_address_snapshot |
| `{{customer.phone}}` | customers.phone |
| `{{customer.email}}` | customers.email |
| `{{customer.gstin}}` | invoices.customer_gstin_snapshot |
| `{{customer.state}}` | derived |
| `{{customer.state_code}}` | derived |
| `{{customer.is_walk_in}}` | boolean |

**Line items (repeating):**
```
{{#lines}}
  {{line_no}} {{item_name}} {{hsn_code}} {{qty}} {{unit}} {{rate}} {{discount_pct}} {{taxable_amt}} {{gst_rate}} {{cgst_amt}} {{sgst_amt}} {{igst_amt}} {{total}}
{{/lines}}
```

Per-line:
| `{{line_no}}`, `{{item_sku}}`, `{{item_name}}`, `{{item_description}}`, `{{hsn_code}}` |
| `{{qty}}` (formatted), `{{qty_raw}}` (string), `{{unit}}`, `{{rate}}`, `{{mrp}}` |
| `{{discount_pct}}`, `{{discount_amt}}` |
| `{{taxable_amt}}`, `{{gst_rate}}`, `{{cgst_amt}}`, `{{sgst_amt}}`, `{{igst_amt}}`, `{{cess_amt}}`, `{{total}}` |
| `{{batch_no}}`, `{{mfg_date}}`, `{{expiry_date}}` |
| `{{is_free}}` (boolean) |
| `{{savings}}` = MRP × qty − total (if > 0) |

**Totals:**
| `{{totals.subtotal}}`, `{{totals.discount_total}}`, `{{totals.taxable_total}}` |
| `{{totals.cgst_total}}`, `{{totals.sgst_total}}`, `{{totals.igst_total}}`, `{{totals.cess_total}}` |
| `{{totals.other_charges}}`, `{{totals.round_off}}`, `{{totals.grand_total}}` |
| `{{totals.grand_total_words}}` — amount in words ("Rupees One Thousand One Hundred Eighty Only") |
| `{{totals.amount_paid}}`, `{{totals.balance_due}}` |
| `{{totals.total_savings}}` — sum of all line savings |

**Tax breakdown (HSN-wise summary):**
```
{{#tax_summary}}
  {{hsn_code}} {{taxable_total}} {{gst_rate}} {{cgst_amt}} {{sgst_amt}} {{igst_amt}}
{{/tax_summary}}
```

**Payments (repeating):**
```
{{#payments}}
  {{mode}} {{amount}} {{reference}}
{{/payments}}
```

**QR codes (server-generated, inline SVG):**
| `{{qr.upi_svg}}` | UPI payment QR (svg markup) |
| `{{qr.verify_svg}}` | Verification QR (svg markup) |
| `{{qr.irn_svg}}` | Government IRN QR (svg markup) — when e-invoicing active |

**Computed conditionals (for `{{#…}}`):**
| `{{#invoice.is_intra_state}}` shows CGST+SGST columns |
| `{{^invoice.is_intra_state}}` shows IGST column |
| `{{#customer.gstin}}` shows GSTIN on print |
| `{{#totals.balance_due_nonzero}}` shows "Balance Due" |
| `{{#invoice.is_void}}` shows VOID watermark |

---

## 4. The Standalone HTML Template (Full Source)

Save this as `invoice_template.html`. After placeholder substitution, the rendered file is ready to print on any paper size or share as-is.

```html
<!DOCTYPE html>
<html lang="{{locale}}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice {{invoice.no}}</title>
<style>
/* ============================================================
   COUNTER INVOICE — STANDALONE TEMPLATE
   Works on: A4, Thermal 80mm, Thermal 58mm
   Switch by setting body class: .paper-a4 / .paper-80 / .paper-58
   ============================================================ */

/* ---------- Reset ---------- */
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #f4f4f4; color: #111; font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }

/* ---------- Paper size and page rules ---------- */
@page a4   { size: A4 portrait;     margin: 12mm; }
@page p80  { size: 80mm auto;       margin: 3mm; }
@page p58  { size: 58mm auto;       margin: 2mm; }

.paper-a4 .invoice { width: 186mm; min-height: 273mm; padding: 0; margin: 8mm auto; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.08); page: a4; }
.paper-80 .invoice { width: 74mm; padding: 0; margin: 4mm auto; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.08); page: p80; font-size: 11px; line-height: 1.35; }
.paper-58 .invoice { width: 54mm; padding: 0; margin: 4mm auto; background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.08); page: p58; font-size: 10px; line-height: 1.3; }

/* ---------- Print toolbar (screen only, hidden when printing) ---------- */
.toolbar { position: sticky; top: 0; z-index: 10; background: #111; color: #fff; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
.toolbar h1 { font-size: 14px; font-weight: 600; margin-right: auto; }
.toolbar button { background: #2563EB; color: #fff; border: 0; padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; }
.toolbar button:hover { background: #1d4ed8; }
.toolbar button.alt { background: transparent; border: 1px solid #555; }
@media print { .toolbar { display: none !important; } body { background: #fff; } .invoice { box-shadow: none !important; margin: 0 !important; } }

/* ---------- Common typography ---------- */
.invoice { color: #111; }
.invoice h2 { font-size: 1.05em; font-weight: 700; }
.invoice .muted { color: #666; }
.invoice .num { font-variant-numeric: tabular-nums; }
.invoice .right { text-align: right; }
.invoice .center { text-align: center; }
.invoice hr { border: 0; border-top: 1px dashed #999; margin: 6px 0; }

/* ============================================================
   A4 LAYOUT
   ============================================================ */
.paper-a4 .invoice { padding: 14mm; font-size: 11pt; line-height: 1.4; }

.paper-a4 .header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
.paper-a4 .seller { display: flex; gap: 12px; align-items: flex-start; }
.paper-a4 .seller .logo { width: 64px; height: 64px; object-fit: contain; }
.paper-a4 .seller .name { font-size: 16pt; font-weight: 800; line-height: 1.1; }
.paper-a4 .seller .tagline { font-size: 9pt; color: #666; }
.paper-a4 .seller .meta { font-size: 9pt; line-height: 1.5; margin-top: 4px; }
.paper-a4 .doc-label { text-align: right; }
.paper-a4 .doc-label .title { font-size: 18pt; font-weight: 800; letter-spacing: 1px; }
.paper-a4 .doc-label .copy { font-size: 8pt; color: #666; margin-top: 2px; }

.paper-a4 .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.paper-a4 .meta-box { border: 1px solid #d0d0d0; padding: 8px 10px; font-size: 10pt; }
.paper-a4 .meta-box .label { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
.paper-a4 .meta-box .name { font-weight: 700; font-size: 11pt; }

.paper-a4 .info-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 9pt; padding: 6px 0; border-bottom: 1px solid #d0d0d0; margin-bottom: 10px; }
.paper-a4 .info-row .k { color: #666; font-size: 8pt; text-transform: uppercase; }
.paper-a4 .info-row .v { font-weight: 600; }

.paper-a4 table.lines { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 10px; }
.paper-a4 table.lines th { background: #111; color: #fff; text-align: left; padding: 6px 6px; font-weight: 600; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .3px; }
.paper-a4 table.lines th.r, .paper-a4 table.lines td.r { text-align: right; }
.paper-a4 table.lines td { padding: 6px 6px; border-bottom: 1px solid #e4e4e4; vertical-align: top; }
.paper-a4 table.lines tr:nth-child(even) td { background: #fafafa; }
.paper-a4 table.lines .item-name { font-weight: 600; }
.paper-a4 table.lines .item-desc { color: #666; font-size: 8.5pt; }

.paper-a4 .totals-block { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; margin-top: 8px; }
.paper-a4 .totals { font-size: 10pt; }
.paper-a4 .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
.paper-a4 .totals .grand { border-top: 2px solid #111; border-bottom: 2px solid #111; font-weight: 800; font-size: 12pt; padding: 6px 0; margin-top: 4px; }
.paper-a4 .amount-words { font-size: 9pt; padding: 6px 0; }
.paper-a4 .amount-words .label { color: #666; font-size: 8pt; }

.paper-a4 .tax-summary { margin-top: 12px; }
.paper-a4 .tax-summary table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.paper-a4 .tax-summary th, .paper-a4 .tax-summary td { border: 1px solid #d0d0d0; padding: 4px 6px; text-align: right; }
.paper-a4 .tax-summary th { background: #f4f4f4; font-weight: 600; }
.paper-a4 .tax-summary th:first-child, .paper-a4 .tax-summary td:first-child { text-align: left; }

.paper-a4 .qr-zone { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 14px; align-items: end; }
.paper-a4 .qr-block { text-align: center; font-size: 8.5pt; color: #444; }
.paper-a4 .qr-block svg { width: 88px; height: 88px; }
.paper-a4 .qr-block .qr-label { margin-top: 2px; font-weight: 600; }
.paper-a4 .signature { text-align: right; }
.paper-a4 .signature img { max-height: 50px; }
.paper-a4 .signature .sig-line { border-top: 1px solid #111; margin-top: 32px; padding-top: 4px; font-size: 9pt; }

.paper-a4 .footer-notes { margin-top: 14px; font-size: 8.5pt; color: #666; border-top: 1px dashed #999; padding-top: 8px; }
.paper-a4 .footer-notes .terms { white-space: pre-wrap; }

.paper-a4 .void-watermark { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 80pt; color: rgba(220,38,38,0.18); font-weight: 900; transform: rotate(-20deg); pointer-events: none; letter-spacing: 8px; }

/* ============================================================
   THERMAL 80mm LAYOUT
   ============================================================ */
.paper-80 .invoice { padding: 4mm; font-family: 'Inter', 'Segoe UI', monospace; }

.paper-80 .t-header { text-align: center; margin-bottom: 4px; }
.paper-80 .t-header .logo { max-height: 32px; margin: 0 auto 2px; display: block; }
.paper-80 .t-header .name { font-size: 13px; font-weight: 700; }
.paper-80 .t-header .meta { font-size: 9px; line-height: 1.3; color: #333; }

.paper-80 .t-doc { text-align: center; font-weight: 700; font-size: 11px; border-top: 1px dashed #999; border-bottom: 1px dashed #999; padding: 3px 0; margin: 4px 0; letter-spacing: .5px; }

.paper-80 .t-meta { font-size: 10px; line-height: 1.4; margin-bottom: 4px; }
.paper-80 .t-meta .row { display: flex; justify-content: space-between; }

.paper-80 table.t-lines { width: 100%; border-collapse: collapse; font-size: 10px; }
.paper-80 table.t-lines th { border-top: 1px dashed #999; border-bottom: 1px dashed #999; padding: 2px 1px; font-weight: 700; text-align: left; }
.paper-80 table.t-lines th.r, .paper-80 table.t-lines td.r { text-align: right; }
.paper-80 table.t-lines td { padding: 2px 1px; vertical-align: top; }
.paper-80 table.t-lines tr.item-row td { padding-top: 3px; }
.paper-80 table.t-lines .item-name { font-weight: 600; }
.paper-80 table.t-lines .sub td { color: #555; font-size: 9px; padding-top: 0; padding-bottom: 3px; }

.paper-80 .t-totals { border-top: 1px dashed #999; padding-top: 3px; margin-top: 3px; font-size: 10px; }
.paper-80 .t-totals .row { display: flex; justify-content: space-between; padding: 1px 0; }
.paper-80 .t-totals .grand { border-top: 1px solid #111; border-bottom: 1px solid #111; font-weight: 800; font-size: 12px; padding: 3px 0; margin: 3px 0; }
.paper-80 .t-words { font-size: 9px; margin-top: 3px; text-align: center; }
.paper-80 .t-savings { text-align: center; font-weight: 700; font-size: 11px; margin: 4px 0; padding: 3px; border: 1px dashed #444; }

.paper-80 .t-qr { text-align: center; margin-top: 6px; }
.paper-80 .t-qr svg { width: 96px; height: 96px; }
.paper-80 .t-qr .qr-label { font-size: 9px; margin-top: 1px; }

.paper-80 .t-footer { text-align: center; font-size: 9px; margin-top: 6px; border-top: 1px dashed #999; padding-top: 4px; }
.paper-80 .t-footer .thank { font-weight: 700; font-size: 11px; }

/* ============================================================
   THERMAL 58mm LAYOUT — denser version of 80mm
   ============================================================ */
.paper-58 .invoice { padding: 2mm; font-family: 'Inter', 'Segoe UI', monospace; }
.paper-58 .t-header .name { font-size: 11px; }
.paper-58 .t-header .meta { font-size: 8px; }
.paper-58 .t-doc { font-size: 10px; }
.paper-58 .t-meta { font-size: 8.5px; }
.paper-58 table.t-lines { font-size: 8.5px; }
.paper-58 table.t-lines .sub td { font-size: 8px; }
.paper-58 .t-totals { font-size: 8.5px; }
.paper-58 .t-totals .grand { font-size: 10px; }
.paper-58 .t-words { font-size: 8px; }
.paper-58 .t-qr svg { width: 78px; height: 78px; }
.paper-58 .t-footer { font-size: 8px; }
.paper-58 .t-footer .thank { font-size: 10px; }

/* Hide A4 chrome when in thermal, and vice-versa */
.paper-a4 .thermal-only, .paper-80 .a4-only, .paper-58 .a4-only { display: none; }
.paper-80 .thermal-only, .paper-58 .thermal-only { display: block; }
.paper-a4 .a4-only { display: block; }

/* Devanagari / Indic script fonts will fall through system stack;
   if specific fonts are desired, embed via @font-face data: URLs */

/* RTL safeguard (for Arabic, Urdu future) */
html[dir="rtl"] .invoice .right { text-align: left; }
html[dir="rtl"] .invoice .left  { text-align: right; }
</style>
</head>
<body class="paper-a4">

<!-- ============= SCREEN-ONLY TOOLBAR ============= -->
<div class="toolbar">
  <h1>Invoice {{invoice.no}}</h1>
  <button onclick="setPaper('a4')">A4</button>
  <button onclick="setPaper('80')">Thermal 80mm</button>
  <button onclick="setPaper('58')">Thermal 58mm</button>
  <button class="alt" onclick="window.print()">Print</button>
</div>

<!-- ============= A4 VIEW ============= -->
<div class="invoice a4-only">
  {{#invoice.is_void}}<div class="void-watermark">VOID</div>{{/invoice.is_void}}

  <div class="header">
    <div class="seller">
      {{#org.logo_base64}}<img class="logo" src="{{org.logo_base64}}" alt="">{{/org.logo_base64}}
      <div>
        <div class="name">{{org.name}}</div>
        {{#org.tagline}}<div class="tagline">{{org.tagline}}</div>{{/org.tagline}}
        <div class="meta">
          {{org.address}}<br>
          Phone: {{org.phone}} {{#org.email}}· {{org.email}}{{/org.email}}<br>
          {{#org.gstin}}GSTIN: <strong>{{org.gstin}}</strong>{{/org.gstin}}
          {{#org.pan}} · PAN: {{org.pan}}{{/org.pan}}
        </div>
      </div>
    </div>
    <div class="doc-label">
      <div class="title">TAX INVOICE</div>
      <div class="copy">{{invoice.copy_label}}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <div class="label">Bill To</div>
      <div class="name">{{customer.name}}</div>
      {{#customer.address}}<div>{{customer.address}}</div>{{/customer.address}}
      {{#customer.gstin}}<div>GSTIN: <strong>{{customer.gstin}}</strong></div>{{/customer.gstin}}
      {{#customer.phone}}<div>Phone: {{customer.phone}}</div>{{/customer.phone}}
      {{#customer.state}}<div>State: {{customer.state}} ({{customer.state_code}})</div>{{/customer.state}}
    </div>
    <div class="meta-box">
      <div class="label">Ship To</div>
      <div>{{#customer.shipping_address}}{{customer.shipping_address}}{{/customer.shipping_address}}{{^customer.shipping_address}}{{customer.address}}{{/customer.shipping_address}}</div>
    </div>
  </div>

  <div class="info-row">
    <div><div class="k">Invoice No</div><div class="v num">{{invoice.no}}</div></div>
    <div><div class="k">Date</div><div class="v num">{{invoice.date}}</div></div>
    <div><div class="k">Place of Supply</div><div class="v">{{invoice.place_of_supply_name}} ({{invoice.place_of_supply}})</div></div>
    <div><div class="k">Reference</div><div class="v">{{invoice.reference_no}}</div></div>
  </div>

  <table class="lines">
    <thead>
      <tr>
        <th style="width:24px;">#</th>
        <th>Item & Description</th>
        <th style="width:70px;">HSN</th>
        <th class="r" style="width:60px;">Qty</th>
        <th style="width:50px;">Unit</th>
        <th class="r" style="width:80px;">Rate</th>
        <th class="r" style="width:50px;">Disc%</th>
        <th class="r" style="width:80px;">Taxable</th>
        {{#invoice.is_intra_state}}
        <th class="r" style="width:60px;">CGST</th>
        <th class="r" style="width:60px;">SGST</th>
        {{/invoice.is_intra_state}}
        {{^invoice.is_intra_state}}
        <th class="r" style="width:80px;">IGST</th>
        {{/invoice.is_intra_state}}
        <th class="r" style="width:90px;">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#lines}}
      <tr>
        <td class="num">{{line_no}}</td>
        <td>
          <div class="item-name">{{item_name}}{{#is_free}} <span style="color:#16a34a;font-weight:700;">FREE</span>{{/is_free}}</div>
          {{#item_description}}<div class="item-desc">{{item_description}}</div>{{/item_description}}
          {{#batch_no}}<div class="item-desc">Batch: {{batch_no}} {{#expiry_date}}· Exp: {{expiry_date}}{{/expiry_date}}</div>{{/batch_no}}
        </td>
        <td class="num">{{hsn_code}}</td>
        <td class="r num">{{qty}}</td>
        <td>{{unit}}</td>
        <td class="r num">{{rate}}</td>
        <td class="r num">{{discount_pct}}</td>
        <td class="r num">{{taxable_amt}}</td>
        {{#invoice.is_intra_state}}
        <td class="r num">{{cgst_amt}}<br><span style="color:#666;font-size:8pt;">({{gst_rate_half}}%)</span></td>
        <td class="r num">{{sgst_amt}}<br><span style="color:#666;font-size:8pt;">({{gst_rate_half}}%)</span></td>
        {{/invoice.is_intra_state}}
        {{^invoice.is_intra_state}}
        <td class="r num">{{igst_amt}}<br><span style="color:#666;font-size:8pt;">({{gst_rate}}%)</span></td>
        {{/invoice.is_intra_state}}
        <td class="r num"><strong>{{total}}</strong></td>
      </tr>
      {{/lines}}
    </tbody>
  </table>

  <div class="totals-block">
    <div class="tax-summary">
      <div class="label" style="font-size:8pt;color:#666;text-transform:uppercase;margin-bottom:4px;">Tax Summary (HSN-wise)</div>
      <table>
        <thead>
          <tr><th>HSN</th><th class="r">Taxable</th><th class="r">Rate</th>
          {{#invoice.is_intra_state}}<th class="r">CGST</th><th class="r">SGST</th>{{/invoice.is_intra_state}}
          {{^invoice.is_intra_state}}<th class="r">IGST</th>{{/invoice.is_intra_state}}
          <th class="r">Total Tax</th></tr>
        </thead>
        <tbody>
          {{#tax_summary}}
          <tr>
            <td class="num">{{hsn_code}}</td>
            <td class="r num">{{taxable_total}}</td>
            <td class="r num">{{gst_rate}}%</td>
            {{#invoice.is_intra_state}}<td class="r num">{{cgst_amt}}</td><td class="r num">{{sgst_amt}}</td>{{/invoice.is_intra_state}}
            {{^invoice.is_intra_state}}<td class="r num">{{igst_amt}}</td>{{/invoice.is_intra_state}}
            <td class="r num">{{tax_total}}</td>
          </tr>
          {{/tax_summary}}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="row"><span>Subtotal</span><span class="num">{{totals.subtotal}}</span></div>
      {{#totals.discount_total_nonzero}}<div class="row"><span>Discount</span><span class="num">− {{totals.discount_total}}</span></div>{{/totals.discount_total_nonzero}}
      <div class="row"><span>Taxable</span><span class="num">{{totals.taxable_total}}</span></div>
      {{#invoice.is_intra_state}}
      <div class="row"><span>CGST</span><span class="num">{{totals.cgst_total}}</span></div>
      <div class="row"><span>SGST</span><span class="num">{{totals.sgst_total}}</span></div>
      {{/invoice.is_intra_state}}
      {{^invoice.is_intra_state}}
      <div class="row"><span>IGST</span><span class="num">{{totals.igst_total}}</span></div>
      {{/invoice.is_intra_state}}
      {{#totals.cess_total_nonzero}}<div class="row"><span>Cess</span><span class="num">{{totals.cess_total}}</span></div>{{/totals.cess_total_nonzero}}
      {{#totals.other_charges_nonzero}}<div class="row"><span>Other Charges</span><span class="num">{{totals.other_charges}}</span></div>{{/totals.other_charges_nonzero}}
      {{#totals.round_off_nonzero}}<div class="row"><span>Round Off</span><span class="num">{{totals.round_off}}</span></div>{{/totals.round_off_nonzero}}
      <div class="row grand"><span>Grand Total</span><span class="num">₹ {{totals.grand_total}}</span></div>
      <div class="amount-words"><span class="label">In Words:</span> {{totals.grand_total_words}}</div>
      {{#totals.balance_due_nonzero}}
        <div class="row"><span>Paid</span><span class="num">{{totals.amount_paid}}</span></div>
        <div class="row" style="font-weight:700;color:#dc2626;"><span>Balance Due</span><span class="num">{{totals.balance_due}}</span></div>
      {{/totals.balance_due_nonzero}}
      {{#totals.total_savings_nonzero}}
        <div class="row" style="color:#16a34a;font-weight:700;border-top:1px dashed #16a34a;padding-top:4px;margin-top:4px;"><span>You Saved</span><span class="num">{{totals.total_savings}}</span></div>
      {{/totals.total_savings_nonzero}}
    </div>
  </div>

  <div class="qr-zone">
    {{#qr.upi_svg}}
    <div class="qr-block">
      {{{qr.upi_svg}}}
      <div class="qr-label">Pay via UPI</div>
      <div style="font-size:8pt;color:#666;">{{org.upi_id}}</div>
    </div>
    {{/qr.upi_svg}}
    {{#qr.verify_svg}}
    <div class="qr-block">
      {{{qr.verify_svg}}}
      <div class="qr-label">Verify Invoice</div>
      <div style="font-size:8pt;color:#666;">{{invoice.verify_url}}</div>
    </div>
    {{/qr.verify_svg}}
    {{#qr.irn_svg}}
    <div class="qr-block">
      {{{qr.irn_svg}}}
      <div class="qr-label">IRN</div>
      <div style="font-size:7pt;color:#666;word-break:break-all;">{{invoice.irn}}</div>
    </div>
    {{/qr.irn_svg}}
    <div class="signature">
      {{#org.signature_base64}}<img src="{{org.signature_base64}}" alt="">{{/org.signature_base64}}
      <div class="sig-line">For {{org.name}}<br><span style="color:#666;font-size:8pt;">Authorized Signatory</span></div>
    </div>
  </div>

  <div class="footer-notes">
    {{#invoice.notes}}<div><strong>Notes:</strong> {{invoice.notes}}</div>{{/invoice.notes}}
    {{#invoice.terms}}<div style="margin-top:4px;"><strong>Terms:</strong><div class="terms">{{invoice.terms}}</div></div>{{/invoice.terms}}
    <div style="margin-top:6px;text-align:center;color:#999;font-size:8pt;">
      Generated by Counter · {{invoice.print_count}} copy · {{invoice.hash}}
    </div>
  </div>
</div>

<!-- ============= THERMAL VIEW (80 / 58) ============= -->
<div class="invoice thermal-only">
  <div class="t-header">
    {{#org.logo_base64}}<img class="logo" src="{{org.logo_base64}}" alt="">{{/org.logo_base64}}
    <div class="name">{{org.name}}</div>
    <div class="meta">
      {{org.address}}<br>
      Ph: {{org.phone}}<br>
      {{#org.gstin}}GSTIN: {{org.gstin}}{{/org.gstin}}
    </div>
  </div>

  <div class="t-doc">TAX INVOICE</div>

  <div class="t-meta">
    <div class="row"><span>Bill No:</span><span><strong>{{invoice.no}}</strong></span></div>
    <div class="row"><span>Date:</span><span>{{invoice.date}}</span></div>
    {{^customer.is_walk_in}}
    <div class="row"><span>Customer:</span><span>{{customer.name}}</span></div>
    {{#customer.phone}}<div class="row"><span>Phone:</span><span>{{customer.phone}}</span></div>{{/customer.phone}}
    {{#customer.gstin}}<div class="row"><span>GSTIN:</span><span style="font-size:9px;">{{customer.gstin}}</span></div>{{/customer.gstin}}
    {{/customer.is_walk_in}}
  </div>

  <table class="t-lines">
    <thead>
      <tr>
        <th>Item</th>
        <th class="r">Qty</th>
        <th class="r">Rate</th>
        <th class="r">Total</th>
      </tr>
    </thead>
    <tbody>
      {{#lines}}
      <tr class="item-row">
        <td colspan="4" class="item-name">{{line_no}}. {{item_name}}{{#is_free}} (FREE){{/is_free}}</td>
      </tr>
      <tr class="sub">
        <td>{{#batch_no}}B: {{batch_no}}{{/batch_no}}{{^batch_no}}&nbsp;{{/batch_no}}</td>
        <td class="r num">{{qty}} {{unit}}</td>
        <td class="r num">{{rate}}</td>
        <td class="r num"><strong>{{total}}</strong></td>
      </tr>
      {{/lines}}
    </tbody>
  </table>

  <div class="t-totals">
    <div class="row"><span>Subtotal</span><span class="num">{{totals.subtotal}}</span></div>
    {{#totals.discount_total_nonzero}}<div class="row"><span>Discount</span><span class="num">− {{totals.discount_total}}</span></div>{{/totals.discount_total_nonzero}}
    {{#invoice.is_intra_state}}
    <div class="row"><span>CGST</span><span class="num">{{totals.cgst_total}}</span></div>
    <div class="row"><span>SGST</span><span class="num">{{totals.sgst_total}}</span></div>
    {{/invoice.is_intra_state}}
    {{^invoice.is_intra_state}}
    <div class="row"><span>IGST</span><span class="num">{{totals.igst_total}}</span></div>
    {{/invoice.is_intra_state}}
    {{#totals.round_off_nonzero}}<div class="row"><span>Round Off</span><span class="num">{{totals.round_off}}</span></div>{{/totals.round_off_nonzero}}
    <div class="row grand"><span>TOTAL</span><span class="num">₹{{totals.grand_total}}</span></div>
    <div class="t-words">{{totals.grand_total_words}}</div>
    {{#totals.balance_due_nonzero}}
      <div class="row"><span>Paid</span><span class="num">{{totals.amount_paid}}</span></div>
      <div class="row" style="font-weight:700;"><span>Due</span><span class="num">{{totals.balance_due}}</span></div>
    {{/totals.balance_due_nonzero}}
  </div>

  {{#payments}}
  <div style="font-size:10px;margin-top:3px;">Paid by {{mode}}: {{amount}}{{#reference}} (Ref: {{reference}}){{/reference}}</div>
  {{/payments}}

  {{#totals.total_savings_nonzero}}
  <div class="t-savings">You Saved ₹{{totals.total_savings}}</div>
  {{/totals.total_savings_nonzero}}

  {{#qr.upi_svg}}
  <div class="t-qr">
    {{{qr.upi_svg}}}
    <div class="qr-label">Scan to pay via UPI</div>
    <div style="font-size:8px;color:#666;">{{org.upi_id}}</div>
  </div>
  {{/qr.upi_svg}}

  {{#qr.verify_svg}}
  <div class="t-qr" style="margin-top:4px;">
    {{{qr.verify_svg}}}
    <div class="qr-label">Verify bill</div>
  </div>
  {{/qr.verify_svg}}

  <div class="t-footer">
    <div class="thank">Thank you, visit again!</div>
    {{#invoice.notes}}<div style="margin-top:3px;">{{invoice.notes}}</div>{{/invoice.notes}}
    <div style="margin-top:4px;color:#666;font-size:8px;">{{org.tagline}}</div>
  </div>
</div>

<script>
// Tiny screen-only helper for paper switching (does not affect rendered file when printed)
function setPaper(size) {
  document.body.className = 'paper-' + size;
  // Apply matching @page rule via dynamic style swap
  var style = document.getElementById('page-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'page-style';
    document.head.appendChild(style);
  }
  if (size === 'a4')  style.textContent = '@page { size: A4 portrait; margin: 12mm; }';
  if (size === '80')  style.textContent = '@page { size: 80mm auto; margin: 3mm; }';
  if (size === '58')  style.textContent = '@page { size: 58mm auto; margin: 2mm; }';
}
// Default to A4 on screen; renderer can set body class to thermal at generation time for receipt sharing
setPaper('a4');
</script>
</body>
</html>
```

### Notes on the template

- **Both layouts live in the same document.** CSS `.a4-only` / `.thermal-only` show/hide based on `body` class. Server-rendered receipts intended for thermal print can be saved with `body class="paper-80"` baked in.
- **Toolbar is hidden on print** (`@media print`).
- **No external resources.** Fonts default to system fonts present on Windows/Mac/Linux/Android. To enforce Inter, embed a subsetted `@font-face` with data: URL (adds ~20–40 KB).
- **QR codes are passed as raw SVG markup** via triple-mustache (`{{{qr.upi_svg}}}`) — the renderer generates SVG server-side using `qrcode-svg` (Node) or equivalent.
- **Triple-mustache** is used wherever raw HTML/SVG is being injected; double-mustache for everything else (auto-escapes).
- **`amount in words`** is pre-formatted server-side (Indian numbering: "Rupees One Lakh Twenty-Five Thousand…").

---

## 5. QR Code Generation Details

### 5.1 UPI Payment QR

The QR encodes a `upi://pay` deep link per [BHIM UPI spec](https://www.npci.org.in/PDF/upi/UPI-Linking-Specs.pdf). Format:

```
upi://pay?pa={UPI_ID}&pn={NAME}&am={AMOUNT}&cu=INR&tn={NOTE}&tr={TRANSACTION_REF}
```

Example string before encoding:
```
upi://pay?pa=ravi@ybl&pn=Ravi%20Stores&am=1180.00&cu=INR&tn=INV-2025-26%2F0123&tr=INV0123
```

Server generates SVG:

```js
// Node.js example
const QRCode = require('qrcode');
const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Invoice ' + invoiceNo)}&tr=${invoiceNo.replace(/[^A-Z0-9]/g,'')}`;
const svgString = await QRCode.toString(upiString, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, width: 96 });
// pass svgString as qr.upi_svg
```

### 5.2 Verification QR

Encodes a public URL: `https://api.counter.app/public/invoices/{hash}`. Customer scans → mobile browser opens → server returns a verified info page (read-only). This proves the invoice exists and is unmodified.

### 5.3 IRN QR (e-invoice)

When GST e-invoicing is active, government API returns a signed QR payload. Encode the **entire signed string** as QR; this is statutorily mandated for B2B invoices above threshold turnover.

---

## 6. Logo Embedding

Logo must be embedded as base64 data URL to keep the invoice standalone.

```js
// Convert image file to data URL once, cache in DB
const fs = require('fs');
const buf = fs.readFileSync('logo.png');
const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
// Store dataUrl on the org record; reuse in every invoice render.
```

Recommended max logo dimensions: 200×80 px, PNG with transparent background, < 30 KB after base64.

---

## 7. Path B — ESC/POS Direct Thermal Template

For maximum print speed (sub-100ms after Save) on directly attached thermal printers, the app sends ESC/POS commands rather than rendering HTML to bitmap. This bypasses the OS print dialog entirely.

ESC/POS is a stream of bytes: control commands + text + line feeds.

### 7.1 Common Commands

| Bytes (hex) | Meaning |
|-------------|---------|
| `1B 40` | ESC @ — Initialize printer |
| `1B 61 00/01/02` | ESC a n — Align left / center / right |
| `1B 21 n` | ESC ! n — Set text mode (bit0=font B, bit3=bold, bit4=double-height, bit5=double-width, bit7=underline) |
| `1D 21 n` | GS ! n — Character size (upper nibble = height, lower = width; 0 = normal) |
| `1B 45 01/00` | ESC E — Bold on / off |
| `1B 2D 01/00` | ESC − — Underline on / off |
| `0A` | LF — Line feed |
| `1B 64 n` | ESC d n — Feed n lines |
| `1D 56 41 03` | Partial cut |
| `1D 56 00` | Full cut |
| `1B 70 00 19 FA` | Open cash drawer pulse |
| `1D 6B …` | GS k — Print barcode |
| `1D 28 6B …` | GS ( k — Print QR code (multi-byte) |

### 7.2 Template Pseudocode

```
INIT
ALIGN CENTER
BOLD ON
SIZE DOUBLE
"{{org.name}}"
SIZE NORMAL
BOLD OFF
"{{org.address}}"
"Ph: {{org.phone}}"
{{#org.gstin}}"GSTIN: {{org.gstin}}"{{/org.gstin}}
LF
HR (a row of '-' chars based on chars-per-line for paper width — 32 chars for 58mm, 48 for 80mm)
BOLD ON
"TAX INVOICE"
BOLD OFF
HR
ALIGN LEFT
"Bill No: {{invoice.no}}     Date: {{invoice.date}}"
{{^customer.is_walk_in}}
"Customer: {{customer.name}}"
{{#customer.phone}}"Phone: {{customer.phone}}"{{/customer.phone}}
{{/customer.is_walk_in}}
HR
"Item              Qty  Rate    Total"   // column-aligned by padding
HR
{{#lines}}
"{{line_no}}. {{item_name truncated to col_width}}"
"  {{qty}} {{unit}}   {{rate}}    {{total}}"
{{/lines}}
HR
"Subtotal:                       {{totals.subtotal}}"
{{#invoice.is_intra_state}}
"CGST:                           {{totals.cgst_total}}"
"SGST:                           {{totals.sgst_total}}"
{{/invoice.is_intra_state}}
{{^invoice.is_intra_state}}
"IGST:                           {{totals.igst_total}}"
{{/invoice.is_intra_state}}
{{#totals.round_off_nonzero}}"Round Off:                      {{totals.round_off}}"{{/totals.round_off_nonzero}}
HR
BOLD ON
SIZE DOUBLE_WIDTH
"TOTAL: {{totals.grand_total}}"
SIZE NORMAL
BOLD OFF
HR
ALIGN CENTER
"{{totals.grand_total_words}}"
LF
{{#payments}}"Paid by {{mode}}: {{amount}}"{{/payments}}
{{#totals.balance_due_nonzero}}BOLD ON "Balance Due: {{totals.balance_due}}" BOLD OFF{{/totals.balance_due_nonzero}}
LF
PRINT_QR("upi://pay?pa={{org.upi_id}}&pn={{org.name}}&am={{totals.grand_total}}&cu=INR&tn={{invoice.no}}", size=6, ec=M)
"Scan to pay via UPI"
LF
PRINT_QR("{{invoice.verify_url}}", size=4)
"Verify invoice"
LF
ALIGN CENTER
BOLD ON "Thank you, visit again!" BOLD OFF
{{#invoice.notes}}"{{invoice.notes}}"{{/invoice.notes}}
FEED 3
PARTIAL_CUT
OPEN_DRAWER (if configured and mode=cash)
```

### 7.3 Library Suggestions

| Platform | Library |
|----------|---------|
| Node.js | `escpos`, `node-thermal-printer` |
| Python | `python-escpos` |
| .NET | `ESCPOS_NET` |
| Browser (WebUSB / WebBluetooth) | `escpos-buffer` |
| Java/Android | `escpos-coffee` |

### 7.4 Connection

- **USB:** detect printer via `0x0416` / `0x5011` vendor IDs (typical) and write to its endpoint.
- **Bluetooth (Android/iOS):** SPP profile; printer name typically "RPP02" or similar.
- **LAN:** open TCP socket on port 9100 (standard "raw" print port); write byte buffer; close.
- **Serial:** open COM port at 9600/19200 baud.

App settings → Printers section maintains per-device printer config.

---

## 8. Chars-per-line Reference

Critical for ESC/POS alignment math:

| Paper | Font A (default) | Font B (smaller) |
|-------|------------------|------------------|
| 58 mm | 32 cols | 42 cols |
| 80 mm | 48 cols | 64 cols |

The template logic must pad/truncate strings to fit.

---

## 9. Multi-Language Support

The HTML template renders any Unicode script as long as a system font covers it.

### 9.1 System Font Coverage

| Script | Default System Font (Windows/Android) |
|--------|---------------------------------------|
| Latin | Segoe UI / Inter / Roboto |
| Devanagari (Hindi/Marathi) | Mangal / Noto Sans Devanagari |
| Tamil | Latha / Noto Sans Tamil |
| Telugu | Gautami / Noto Sans Telugu |
| Kannada | Tunga / Noto Sans Kannada |
| Bengali | Vrinda / Noto Sans Bengali |
| Gujarati | Shruti / Noto Sans Gujarati |
| Punjabi (Gurmukhi) | Raavi / Noto Sans Gurmukhi |

### 9.2 Embedding Specific Fonts (optional)

If consistent rendering across devices is mandatory:

```css
@font-face {
  font-family: 'NotoSansDevanagari';
  src: url('data:font/woff2;base64,d09GMgAB...') format('woff2');
  font-display: swap;
}
.invoice { font-family: 'NotoSansDevanagari', 'Inter', sans-serif; }
```

Embed only the subsetted glyphs needed (use `pyftsubset` or `glyphhanger`); typical subset size 30–80 KB per script.

### 9.3 Thermal Limitations

Most ESC/POS thermal printers do **not** natively support Indic scripts in their character ROM. Two options:
- **Use HTML→raster path:** Render the HTML template at thermal width, rasterize to a bitmap, print as image (slower, ~2–5 seconds).
- **Use printer's built-in image mode:** Convert Indic text strings to bitmap server-side and send via `GS v 0` raster bit image command. Smarter library wrappers (e.g. `node-thermal-printer`'s `printImage`) handle this transparently.

### 9.4 Per-Language Templates

Strings outside data (headers like "Bill No", "TOTAL", "Thank you") are localized. Renderer picks the correct strings file:

| Key | en-IN | hi | ta |
|-----|-------|----|----|
| `tax_invoice` | TAX INVOICE | कर बिल | வரி விலைப்பட்டியல் |
| `bill_no` | Bill No | बिल नं. | பில் எண் |
| `date` | Date | दिनांक | தேதி |
| `total` | TOTAL | कुल | மொத்தம் |
| `paid` | Paid | भुगतान | செலுத்தியது |
| `balance_due` | Balance Due | शेष राशि | நிலுவை |
| `thank_you` | Thank you, visit again! | धन्यवाद, फिर पधारें! | நன்றி, மீண்டும் வாருங்கள்! |
| `in_words` | In Words | शब्दों में | வார்த்தைகளில் |
| `amount_words_prefix` | Rupees | रुपये | ரூபாய் |

Renderer reads `{{i18n.tax_invoice}}` etc.

---

## 10. PDF Generation

For email/WhatsApp/archival, the HTML template is rendered to PDF server-side. Two reliable approaches:

### 10.1 Puppeteer (Node.js, Chrome-based)

```js
const puppeteer = require('puppeteer');

async function renderInvoicePDF(html, paper = 'a4') {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.evaluate((p) => document.body.className = 'paper-' + p, paper);
  const pdf = await page.pdf({
    format: paper === 'a4' ? 'A4' : undefined,
    width: paper === '80' ? '80mm' : paper === '58' ? '58mm' : undefined,
    margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' },
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  return pdf;
}
```

### 10.2 wkhtmltopdf

```bash
wkhtmltopdf --page-size A4 --margin-top 12mm --print-media-type input.html invoice.pdf
```

PDFs are cached on `invoices.pdf_url` and served on demand.

---

## 11. Print-Time Code (in the desktop app)

The Tauri/Electron client invokes printing through one of three pathways:

```js
// Pathway 1: HTML → OS print dialog (A4)
async function printA4(invoiceId) {
  const html = await renderInvoiceHtml(invoiceId, { paper: 'a4' });
  const win = await tauri.window.create({ url: 'data:text/html,' + encodeURIComponent(html), visible: false });
  await win.print();   // OS dialog
  await win.close();
}

// Pathway 2: HTML rasterized → ESC/POS bitmap (thermal, slower but full-fidelity)
async function printThermalHTML(invoiceId, paper = '80') {
  const html = await renderInvoiceHtml(invoiceId, { paper });
  const png = await rasterizeHTML(html, { width: paper === '80' ? 576 : 384 });  // pixels at 203 DPI
  await escpos.printImage(png);
  await escpos.cut();
}

// Pathway 3: Direct ESC/POS (thermal, fastest)
async function printThermalEscPos(invoiceId, paper = '80') {
  const invoice = await getInvoice(invoiceId);
  const cmds = buildEscPosBuffer(invoice, paper);   // applies template from §7.2
  await escpos.write(cmds);
  await escpos.cut();
}
```

Selection logic:
- A4 printer assigned → Pathway 1.
- Thermal printer assigned + `print_mode = native` → Pathway 3 (default; fastest).
- Thermal printer + `print_mode = html` (for orgs with Indic-script invoices) → Pathway 2.

---

## 12. How "Standalone" Plays Out in the Real World

Every rendered invoice is a single HTML file with the form `invoice_INV-2025-26-0123.html`. Because nothing in it references the network:

| Scenario | Behavior |
|----------|----------|
| Customer opens emailed file on a phone with no data | ✅ Renders, including logo and QRs |
| Saved to USB stick, opened on another PC | ✅ Renders identically |
| Forwarded on WhatsApp as document | ✅ Recipient sees same invoice |
| Opened in airplane mode | ✅ Works |
| Printed years later from archive | ✅ Same layout |
| Customer scans UPI QR | ✅ Opens UPI app with payment pre-filled |
| Customer scans verification QR | Requires internet on the scanning device to reach `https://api.counter.app/public/...` — but the invoice itself displays fine offline |

The verification QR is the **one** networked feature, and it's intentional: it lets a customer verify the invoice exists in your records and hasn't been tampered with. Without internet, the customer still has a fully readable, GST-compliant invoice — they just can't reach the verification endpoint.

---

## 13. Sample Output Specs

| Output | Filename | Typical Size | Renderer |
|--------|----------|--------------|----------|
| A4 HTML | `INV-2025-26-0123_a4.html` | 60–120 KB (logo dominant) | Mustache + server |
| Thermal HTML | `INV-2025-26-0123_t80.html` | 30–60 KB | Same |
| A4 PDF | `INV-2025-26-0123_a4.pdf` | 80–200 KB | Puppeteer |
| Thermal PDF (80mm) | `INV-2025-26-0123_t80.pdf` | 30–80 KB | Puppeteer |
| ESC/POS buffer | (binary, sent directly) | 1–4 KB | escpos lib |

---

## 14. Test Matrix

Required pre-launch verification on real hardware:

| Test | Pass Criteria |
|------|---------------|
| A4 print on inkjet | Headers, table, totals, QRs all within margins |
| A4 print on laser | Same; verify rich blacks not gray |
| A4 PDF preview | All text selectable; QRs scan correctly |
| Thermal 80mm — Epson TM-T82 (ESC/POS) | Full receipt prints in < 1.5s; cut works |
| Thermal 80mm — TVS RP3200 | Same |
| Thermal 58mm — generic mPOS | All content fits; no truncation |
| Bluetooth thermal — Bixolon | Pairs; prints |
| LAN thermal — Star TSP143 | TCP 9100; prints |
| HTML on iOS Safari | Renders identically; QR taps open UPI |
| HTML on Android Chrome | Same |
| HTML in Gmail / WhatsApp document preview | Renders correctly |
| Offline rendering (airplane mode) | All visual elements present |
| Hindi/Tamil text rendering | No tofu boxes; full ligatures |
| 100-line invoice | Page breaks correctly on A4; continuous on thermal |
| Void invoice | "VOID" watermark visible on A4; "VOIDED" header on thermal |
| Verification QR | Scans → opens public verify URL with matching hash |
| UPI QR (₹0 free items) | Disabled when grand_total = 0 |

---

## 15. Maintenance & Customization

Template variants are stored in `print_templates` table (per `Counter_API_Spec.md` §22.6):

| Field | Notes |
|-------|-------|
| name | "Standard" / "Festive" / "Workshop" |
| type | invoice / credit_note / job_card / po / payment_receipt |
| paper_size | A4 / thermal58 / thermal80 / all |
| html_template | The raw template text with placeholders |
| is_default | One per (type, paper_size) |

Owner can edit via Settings → Invoice & Print Templates. A live preview rebuilds against a sample invoice on every keystroke (debounced).

For festivals or branding, additional templates can be plugged in without code changes — they're just data.

---

*End of invoice templates specification.*
