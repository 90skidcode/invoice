import type { DbClient } from '@counter/db';
import { invoice_lines, invoices, organizations } from '@counter/db';
import { amountInWords, formatDisplayDate, formatIndianNumber } from '@counter/utils';
import { and, eq, isNull } from 'drizzle-orm';
import QRCode from 'qrcode';
import type { RequestContext } from '../context.js';
import { NotFoundError } from '../errors.js';
import { COCOGLO_LOGO_BASE64 } from './logo.js';

export type Paper = 'a4' | 'thermal80' | 'thermal58';

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(v: unknown): string {
  return formatIndianNumber(String(v ?? '0'), 2, '');
}

async function upiQrSvg(upiId: string, name: string, amount: string, ref: string): Promise<string> {
  const s = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Invoice ${ref}`)}&tr=${ref.replace(/[^A-Z0-9]/gi, '')}`;
  return QRCode.toString(s, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, width: 96 });
}

async function verifyQrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0, width: 96 });
}

const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f0f4f1;color:#2d3748;font-family:'Inter','Segoe UI',Arial,sans-serif}
.toolbar{position:sticky;top:0;background:#1e352f;color:#fff;padding:12px 16px;display:flex;gap:8px;align-items:center;z-index:100;box-shadow:0 2px 4px rgba(0,0,0,.1)}
.toolbar h1{font-size:14px;margin-right:auto;font-weight:600}
.toolbar button{background:#2d6a4f;color:#fff;border:0;padding:8px 16px;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.2s}
.toolbar button:hover{background:#1b4332}
@media print{.toolbar{display:none!important}body{background:#fff}.invoice{box-shadow:none!important;margin:0!important;border:none!important}}
.num{font-variant-numeric:tabular-nums}.right{text-align:right}.muted{color:#718096}
.invoice{background:#fff;margin:8mm auto;box-shadow:0 4px 20px rgba(0,0,0,.05);position:relative;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0}
/* A4 */
.paper-a4 .invoice{width:210mm;min-height:297mm;padding:16mm;font-size:10pt;line-height:1.5;border-top:8px solid #1b4332}
.paper-a4 .invoice::before{content:'';position:absolute;top:0;left:0;right:0;height:8px;background:linear-gradient(90deg, #1b4332 0%, #2d6a4f 50%, #52b788 100%)}
@page{size:A4 portrait;margin:0}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid #edf2f7}
.hdr-left{display:flex;gap:16px;align-items:center}
.org-logo{height:72px;max-width:180px;object-fit:contain}
.hdr .name{font-size:18pt;font-weight:800;color:#1b4332;letter-spacing:-0.5px}
.hdr .meta{font-size:8.5pt;color:#4a5568;line-height:1.6;margin-top:4px}
.hdr .meta-link{color:#2d6a4f;text-decoration:none}
.doc-title{font-size:22pt;font-weight:900;letter-spacing:1px;text-align:right;color:#1b4332}
.doc-subtitle{font-size:9pt;text-transform:uppercase;color:#718096;letter-spacing:1.5px;text-align:right;margin-top:2px}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.box{border:none;border-radius:8px;background:#f7fafc;border-top:4px solid #2d6a4f;box-shadow:0 1px 3px rgba(0,0,0,0.02);padding:12px 14px;font-size:9.5pt}
.box .label{font-size:8pt;color:#718096;font-weight:700;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.5px}
table.lines{width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:16px;border-radius:6px;overflow:hidden}
table.lines th{background:#1b4332;color:#fff;text-align:left;padding:8px 10px;font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
table.lines th.r,table.lines td.r{text-align:right}
table.lines td{padding:8px 10px;border-bottom:1px solid #edf2f7}
table.lines tr:nth-child(even) td{background:#fcfdfc}
.totals{margin-top:12px;margin-left:auto;width:300px;font-size:9.5pt}
.totals .row{display:flex;justify-content:space-between;padding:4px 0;color:#4a5568}
.totals .grand{border-top:2px solid #1b4332;border-bottom:2px solid #1b4332;font-weight:800;font-size:13pt;color:#1b4332;padding:8px 0;margin-top:6px}
.words{font-size:8.5pt;margin-top:12px;color:#4a5568}.words .label{font-weight:700;color:#718096}
.qr-zone{display:flex;gap:24px;margin-top:24px;align-items:flex-end;border-top:1px solid #edf2f7;padding-top:16px}
.qr-block{text-align:center;font-size:8pt;color:#4a5568;font-weight:500}
.qr-block svg{width:88px;height:88px;margin-bottom:4px;border:1px solid #e2e8f0;border-radius:4px;padding:2px;background:#fff}
.footer{margin-top:24px;font-size:8pt;color:#a0aec0;border-top:1px dashed #e2e8f0;padding-top:12px;text-align:center}
/* Thermal */
.paper-t .invoice{width:74mm;padding:4mm;font-size:11px;line-height:1.35;font-family:'Inter',monospace}
.paper-t .a4-only{display:none}
.paper-a4 .t-only{display:none}
.paper-t .t-center{text-align:center}
.paper-t .t-name{font-size:13px;font-weight:700;text-align:center;color:#1b4332}
.paper-t .t-meta{font-size:9px;text-align:center;color:#333}
.paper-t .t-doc{text-align:center;font-weight:700;border-top:1px dashed #999;border-bottom:1px dashed #999;padding:3px 0;margin:4px 0}
.paper-t table.t-lines{width:100%;border-collapse:collapse;font-size:10px}
.paper-t table.t-lines td{padding:2px 1px}.paper-t .r{text-align:right}
.paper-t hr{border:0;border-top:1px dashed #999;margin:4px 0}
.paper-t .t-row{display:flex;justify-content:space-between;font-size:10px}
.paper-t .t-grand{font-weight:800;font-size:13px;border-top:1px solid #111;border-bottom:1px solid #111;padding:3px 0;margin:3px 0}
`;

interface RenderData {
  org: {
    name: string;
    address: string | null;
    phone: string | null;
    gstin: string | null;
    upi_id: string | null;
    email: string | null;
  };
  inv: typeof invoices.$inferSelect;
  lines: (typeof invoice_lines.$inferSelect)[];
  paper: Paper;
  verifyUrl: string;
}

async function buildHtml(d: RenderData): Promise<string> {
  const { org, inv, lines, paper, verifyUrl } = d;
  const isThermal = paper !== 'a4';
  const bodyClass = isThermal ? 'paper-t' : 'paper-a4';
  const intra = inv.is_intra_state;

  const upiQr = org.upi_id
    ? await upiQrSvg(org.upi_id, org.name, String(inv.grand_total), inv.invoice_no)
    : '';
  const verifyQr = await verifyQrSvg(verifyUrl);

  const lineRowsA4 = lines
    .map(
      (l, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td>${esc(l.item_name_snapshot)}${l.is_free ? ' <strong style="color:#16a34a">FREE</strong>' : ''}</td>
      <td class="num">${esc(l.hsn_code ?? '')}</td>
      <td class="r num">${esc(l.qty)}</td>
      <td class="r num">${money(l.rate)}</td>
      <td class="r num">${money(l.taxable_amt)}</td>
      ${intra ? `<td class="r num">${money(l.cgst_amt)}</td><td class="r num">${money(l.sgst_amt)}</td>` : `<td class="r num">${money(l.igst_amt)}</td>`}
      <td class="r num"><strong>${money(l.total)}</strong></td>
    </tr>`,
    )
    .join('');

  const lineRowsThermal = lines
    .map(
      (l, i) => `<tr><td colspan="3">${i + 1}. ${esc(l.item_name_snapshot)}</td></tr>
      <tr><td class="muted">${esc(l.qty)} x ${money(l.rate)}</td><td></td><td class="r"><strong>${money(l.total)}</strong></td></tr>`,
    )
    .join('');

  const taxHeader = intra
    ? '<th class="r">CGST</th><th class="r">SGST</th>'
    : '<th class="r">IGST</th>';

  const a4 = `
  <div class="invoice a4-only">
    <div class="hdr">
      <div class="hdr-left">
        <img src="${COCOGLO_LOGO_BASE64}" class="org-logo" alt="CocoGlo" />
        <div>
          <div class="name">${esc(org.name)}</div>
          <div class="meta">
            ${esc(org.address ?? '')}<br>
            ${org.phone ? `💬 Whats/call: <a class="meta-link" href="https://wa.me/${org.phone.replace(/[^0-9]/g, '')}">${esc(org.phone.replace('+91', ''))}</a>` : ''}
            ${org.email ? ` · 📧 Email: <a class="meta-link" href="mailto:${esc(org.email)}">${esc(org.email)}</a>` : ''}<br>
            📸 Insta: <a class="meta-link" href="https://instagram.com/cocoglo.in" target="_blank">cocoglo.in</a>
            ${org.gstin ? ` · GSTIN: <strong>${esc(org.gstin)}</strong>` : ''}
          </div>
        </div>
      </div>
      <div>
        <div class="doc-title">TAX INVOICE</div>
        <div class="doc-subtitle">Original for Recipient</div>
      </div>
    </div>
    <div class="meta-grid">
      <div class="box">
        <div class="label">Bill To</div>
        <div><strong>${esc(inv.customer_name_snapshot ?? 'Walk-in Customer')}</strong></div>
        ${inv.customer_gstin_snapshot ? `<div style="margin-top:4px;">GSTIN: <strong>${esc(inv.customer_gstin_snapshot)}</strong></div>` : ''}
      </div>
      <div class="box">
        <div class="label">Invoice Details</div>
        <div>Invoice No: <strong>${esc(inv.invoice_no)}</strong></div>
        <div>Date: <strong>${esc(formatDisplayDate(inv.invoice_date))}</strong></div>
        <div style="margin-top:4px;">Place of Supply: ${esc(inv.place_of_supply)}</div>
      </div>
    </div>
    <table class="lines">
      <thead>
        <tr>
          <th>#</th>
          <th>Item Description</th>
          <th>HSN</th>
          <th class="r">Qty</th>
          <th class="r">Rate</th>
          <th class="r">Taxable</th>
          ${taxHeader}
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>${lineRowsA4}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>Taxable Amount</span><span class="num">${money(inv.taxable_total)}</span></div>
      ${intra ? `<div class="row"><span>CGST</span><span class="num">${money(inv.cgst_total)}</span></div><div class="row"><span>SGST</span><span class="num">${money(inv.sgst_total)}</span></div>` : `<div class="row"><span>IGST</span><span class="num">${money(inv.igst_total)}</span></div>`}
      ${Number(inv.round_off) !== 0 ? `<div class="row"><span>Round Off</span><span class="num">${money(inv.round_off)}</span></div>` : ''}
      <div class="row grand"><span>Grand Total</span><span class="num">₹ ${money(inv.grand_total)}</span></div>
      <div class="words"><span class="label">Amount in words:</span> ${esc(amountInWords(String(inv.grand_total)))}</div>
      ${Number(inv.balance_due) > 0 ? `<div class="row" style="color:#dc2626;font-weight:700;margin-top:8px;border-top:1px solid #fecaca;padding-top:6px"><span>Balance Due</span><span class="num">₹ ${money(inv.balance_due)}</span></div>` : ''}
    </div>
    <div class="qr-zone">
      ${upiQr ? `<div class="qr-block">${upiQr}<div>Scan &amp; Pay via UPI</div><div class="muted" style="margin-top:2px">${esc(org.upi_id)}</div></div>` : ''}
      <div class="qr-block">${verifyQr}<div>Verify Invoice</div><div class="muted" style="margin-top:2px">Proves authenticity</div></div>
    </div>
    <div class="footer">Generated by Counter · ${esc(inv.invoice_hash ?? '')}</div>
  </div>`;

  const thermal = `
  <div class="invoice t-only">
    <div class="t-name">${esc(org.name)}</div>
    <div class="t-meta">
      ${esc(org.address ?? '')}<br>
      ${org.phone ? `Whats/call: ${esc(org.phone.replace('+91', ''))}<br>` : ''}
      ${org.email ? `Email: ${esc(org.email)}<br>` : ''}
      Insta: cocoglo.in<br>
      ${org.gstin ? `GSTIN: ${esc(org.gstin)}` : ''}
    </div>
    <div class="t-doc">TAX INVOICE</div>
    <div class="t-row"><span>Bill: ${esc(inv.invoice_no)}</span><span>${esc(formatDisplayDate(inv.invoice_date))}</span></div>
    ${inv.customer_name_snapshot ? `<div class="t-row"><span>Cust: ${esc(inv.customer_name_snapshot)}</span></div>` : ''}
    <hr>
    <table class="t-lines"><tbody>${lineRowsThermal}</tbody></table>
    <hr>
    <div class="t-row"><span>Taxable</span><span>${money(inv.taxable_total)}</span></div>
    ${intra ? `<div class="t-row"><span>CGST</span><span>${money(inv.cgst_total)}</span></div><div class="t-row"><span>SGST</span><span>${money(inv.sgst_total)}</span></div>` : `<div class="t-row"><span>IGST</span><span>${money(inv.igst_total)}</span></div>`}
    <div class="t-row t-grand"><span>TOTAL</span><span>₹${money(inv.grand_total)}</span></div>
    <div class="t-center" style="font-size:9px">${esc(amountInWords(String(inv.grand_total)))}</div>
    ${upiQr ? `<div class="t-center" style="margin-top:6px">${upiQr}<div style="font-size:9px">Scan to pay via UPI</div></div>` : ''}
    <div class="t-center" style="margin-top:8px;font-weight:700">Thank you, visit again!</div>
  </div>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${esc(inv.invoice_no)}</title><style>${STYLE}</style></head>
<body class="${bodyClass}">
<div class="toolbar"><h1>Invoice ${esc(inv.invoice_no)}</h1><button onclick="window.print()">Print</button></div>
${a4}${thermal}
</body></html>`;
}

export async function renderInvoiceHtml(
  db: DbClient,
  ctx: RequestContext,
  invoiceId: string,
  paper: Paper,
  publicBaseUrl: string,
): Promise<string> {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.id, invoiceId), eq(invoices.org_id, ctx.org_id), isNull(invoices.deleted_at)),
    );
  if (!inv) throw new NotFoundError('Invoice', invoiceId);

  const lines = await db
    .select()
    .from(invoice_lines)
    .where(eq(invoice_lines.invoice_id, invoiceId))
    .orderBy(invoice_lines.line_no);

  const [org] = await db
    .select({
      name: organizations.name,
      address: organizations.address,
      phone: organizations.phone,
      gstin: organizations.gstin,
      upi_id: organizations.upi_id,
      email: organizations.email,
    })
    .from(organizations)
    .where(eq(organizations.id, ctx.org_id));

  const verifyUrl = `${publicBaseUrl}/public/invoices/${inv.invoice_hash}`;

  return buildHtml({
    org: org ?? {
      name: 'Counter',
      address: null,
      phone: null,
      gstin: null,
      upi_id: null,
      email: null,
    },
    inv,
    lines,
    paper,
    verifyUrl,
  });
}
