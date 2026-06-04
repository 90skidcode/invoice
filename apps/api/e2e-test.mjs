import { randomUUID } from 'node:crypto';
// End-to-end smoke test against a running API + live Supabase DB.
// Flow: login → item lookup → create item → create invoice → report.
import { readFileSync } from 'node:fs';

const BASE = process.env.API_BASE ?? 'http://localhost:3001';
const seed = JSON.parse(readFileSync(new URL('./seed-output.json', import.meta.url)));

function log(step, ok, detail) {
  console.info(`${ok ? '✓' : '✗'} ${step}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function call(method, path, body, token, extraHeaders = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

function decodeJwtAlg(jwt) {
  try {
    const header = JSON.parse(Buffer.from(jwt.split('.')[0], 'base64url').toString());
    return header.alg;
  } catch {
    return null;
  }
}

// ─── 1. Login ────────────────────────────────────────────────────────────────
const login = await call('POST', '/v1/auth/login', {
  identifier: seed.login.phone,
  credential: seed.login.pin,
  credential_type: 'pin',
  org_code: seed.orgCode,
  device: {
    id: randomUUID(),
    name: 'E2E Runner',
    platform: 'web',
    app_version: '1.0.0',
    install_id: 'e2e-install',
  },
});
log(
  'login',
  login.status === 200 && !!login.json.data?.access_token,
  `status ${login.status}, perms=${login.json.data?.permissions?.length}`,
);
const token = login.json.data?.access_token;
const refreshToken = login.json.data?.refresh_token;
if (!token) {
  console.error(JSON.stringify(login.json, null, 2));
  process.exit(1);
}

log('  token is RS256', decodeJwtAlg(token) === 'RS256', `alg=${decodeJwtAlg(token)}`);

// ─── 2. Item lookup ────────────────────────────────────────────────────────────
const lookup = await call('GET', '/v1/items/lookup?q=Coconut', null, token);
log(
  'item lookup',
  lookup.status === 200 && lookup.json.data?.length >= 1,
  `found ${lookup.json.data?.length} item(s)`,
);

// ─── 2b. POS bootstrap ─────────────────────────────────────────────────────────
const boot = await call('GET', '/v1/pos/bootstrap', null, token);
log(
  'pos bootstrap',
  boot.status === 200 && !!boot.json.data?.default_series_id,
  `series/branch/location resolved, ${boot.json.data?.payment_modes?.length} payment modes`,
);

// ─── 2c. Item list (paginated) ───────────────────────────────────────────────
const list = await call('GET', '/v1/items?limit=10', null, token);
log(
  'item list',
  list.status === 200 && Array.isArray(list.json.data),
  `${list.json.data?.length} items, has_more=${list.json.page?.has_more}`,
);

// ─── 2d. Item detail with derived stock ──────────────────────────────────────
const detail = await call('GET', `/v1/items/${seed.items.itemAId}`, null, token);
const stock = detail.json.data?.current_stock;
log(
  'item detail + derived stock',
  detail.status === 200 && Array.isArray(stock),
  `stock rows: ${JSON.stringify(stock)}`,
);

// ─── 3. Create item (with idempotency) ───────────────────────────────────────
const newSku = `ITM-E2E-${Date.now()}`;
const itemBody = {
  client_id: randomUUID(),
  sku: newSku,
  name: 'E2E Test Item',
  primary_unit_id: seed.unitIds.PCS,
  tax_rate_id: seed.taxRateIds['GST 18%'],
  pricing: {
    mrp: '100.00',
    sale_price: '90.00',
    purchase_price: '60.00',
    tax_inclusive: false,
    min_sale_price: null,
    max_discount_pct: null,
  },
  flags: {
    track_inventory: true,
    is_service: false,
    is_batched: false,
    allow_negative_stock: false,
    has_variants: false,
  },
  status: 'active',
};
const idemKey = randomUUID();
const createItem = await call('POST', '/v1/items', itemBody, token, { 'Idempotency-Key': idemKey });
log('create item', createItem.status === 201, `${newSku} → status ${createItem.status}`);

// Replay the SAME request with the SAME Idempotency-Key — must return the cached
// response (same id), NOT create a duplicate or fail on the unique SKU.
const replay = await call('POST', '/v1/items', itemBody, token, { 'Idempotency-Key': idemKey });
const sameId = replay.json.data?.id === createItem.json.data?.id;
const replayed = replay.headers.get('idempotent-replay') === 'true';
log(
  '  idempotent replay',
  replay.status === 201 && sameId && replayed,
  `same_id=${sameId}, replay_header=${replayed}`,
);

// ─── 4. Create invoice (2 × Coconut Body Oil @ 249, GST 18%, intra-state) ─────
const invoice = await call(
  'POST',
  '/v1/invoices',
  {
    client_id: randomUUID(),
    series_id: seed.seriesId,
    branch_id: seed.branchId,
    invoice_date: '2026-05-31',
    customer_id: null,
    place_of_supply: '29',
    lines: [
      {
        client_id: randomUUID(),
        item_id: seed.items.itemAId,
        qty: '2',
        unit_id: seed.unitIds.PCS,
        rate: '249.00',
        discount_pct: '0',
        tax_rate_id: seed.taxRateIds['GST 18%'],
        location_id: seed.locationId,
        is_free: false,
      },
    ],
    payments: [{ mode: 'cash', amount: '588.00' }],
  },
  token,
);
const inv = invoice.json.data;
log(
  'create invoice',
  invoice.status === 201 && !!inv?.invoice_no,
  inv
    ? `${inv.invoice_no}, grand ${inv.grand_total}`
    : `status ${invoice.status} ${JSON.stringify(invoice.json.error)}`,
);

// Expected: taxable 498.00, tax 89.64, round_off 0.36, grand 588.00
if (inv) {
  log('  grand total = 588.00', inv.grand_total === '588.00', `got ${inv.grand_total}`);
  log('  invoice no assigned', /^INV-\d{4}\/2026-27$/.test(inv.invoice_no), inv.invoice_no);
}

// ─── 5. Negative-stock guard (item A has 100 opening; oversell 9999) ─────────
const oversell = await call(
  'POST',
  '/v1/invoices',
  {
    client_id: randomUUID(),
    series_id: seed.seriesId,
    branch_id: seed.branchId,
    invoice_date: '2026-05-31',
    customer_id: null,
    place_of_supply: '29',
    lines: [
      {
        client_id: randomUUID(),
        item_id: seed.items.itemAId,
        qty: '9999',
        unit_id: seed.unitIds.PCS,
        rate: '249.00',
        discount_pct: '0',
        tax_rate_id: seed.taxRateIds['GST 18%'],
        location_id: seed.locationId,
        is_free: false,
      },
    ],
  },
  token,
);
log(
  'negative-stock rejected',
  oversell.status === 400 && oversell.json.error?.code === 'BUSINESS_RULE_VIOLATION',
  `status ${oversell.status}, code ${oversell.json.error?.code}`,
);

// ─── 6. Refresh token rotation ───────────────────────────────────────────────
const refreshed = await call('POST', '/v1/auth/refresh', { refresh_token: refreshToken });
const newAccess = refreshed.json.data?.access_token;
const newRefresh = refreshed.json.data?.refresh_token;
log(
  'refresh token',
  refreshed.status === 200 && !!newAccess && newRefresh !== refreshToken,
  `status ${refreshed.status}, rotated=${newRefresh !== refreshToken}`,
);

// Old refresh token must now be revoked (single-use rotation).
const reuseOld = await call('POST', '/v1/auth/refresh', { refresh_token: refreshToken });
log('  old refresh revoked', reuseOld.status === 401, `status ${reuseOld.status}`);

// ─── 7. Logout revokes the (new) refresh token ───────────────────────────────
const logout = await call('POST', '/v1/auth/logout', { refresh_token: newRefresh });
log('logout', logout.status === 200, `status ${logout.status}`);
const afterLogout = await call('POST', '/v1/auth/refresh', { refresh_token: newRefresh });
log('  refresh after logout rejected', afterLogout.status === 401, `status ${afterLogout.status}`);

// ─── 8. Customers + credit-limit enforcement ─────────────────────────────────
const custId = randomUUID();
const createCust = await call(
  'POST',
  '/v1/customers',
  {
    client_id: custId,
    name: 'Credit Customer',
    type: 'Business',
    phone: '9000000001',
    gst_reg_type: 'Regular',
    credit_limit: '1000.00',
    credit_days: 30,
    block_on_limit_breach: true,
    opening_balance: '0.00',
    status: 'Active',
  },
  token,
);
log(
  'create customer',
  createCust.status === 201,
  `status ${createCust.status}, code ${createCust.json.data?.customer_code}`,
);

// Credit sale 1 — item B (₹499 + 5% = ₹524), no payment → balance due 524, under limit
function creditSale() {
  return call(
    'POST',
    '/v1/invoices',
    {
      client_id: randomUUID(),
      series_id: seed.seriesId,
      branch_id: seed.branchId,
      invoice_date: '2026-05-31',
      customer_id: custId,
      place_of_supply: '29',
      lines: [
        {
          client_id: randomUUID(),
          item_id: seed.items.itemBId,
          qty: '1',
          unit_id: seed.unitIds.LTR,
          rate: '499.00',
          discount_pct: '0',
          tax_rate_id: seed.taxRateIds['GST 5%'],
          location_id: seed.locationId,
          is_free: false,
        },
      ],
    },
    token,
  );
}

const sale1 = await creditSale();
log(
  'credit sale 1 (under limit)',
  sale1.status === 201,
  `status ${sale1.status}, grand ${sale1.json.data?.grand_total}`,
);

const outstanding = await call('GET', `/v1/customers/${custId}/outstanding`, null, token);
log(
  '  outstanding reflects balance',
  outstanding.json.data?.balance_due === '524.00',
  `balance_due ${outstanding.json.data?.balance_due}, status ${outstanding.json.data?.credit_status}`,
);

// Credit sale 2 — would push outstanding to 1048 > 1000 → blocked
const sale2 = await creditSale();
log(
  'credit sale 2 (over limit) rejected',
  sale2.status === 400 && sale2.json.error?.code === 'BUSINESS_RULE_VIOLATION',
  `status ${sale2.status}, code ${sale2.json.error?.code}`,
);

const custLookup = await call('GET', '/v1/customers/lookup?q=Credit', null, token);
log(
  'customer lookup',
  custLookup.status === 200 && custLookup.json.data?.length >= 1,
  `found ${custLookup.json.data?.length}, status ${custLookup.json.data?.[0]?.credit_status}`,
);

// ─── 9. Receipt settles the credit sale ──────────────────────────────────────
const before = await call('GET', `/v1/customers/${custId}/outstanding`, null, token);
const openInv = before.json.data?.open_invoices?.[0];
log(
  'has open invoice to settle',
  !!openInv,
  `invoice ${openInv?.invoice_no}, due ${openInv?.balance_due}`,
);

const receipt = await call(
  'POST',
  '/v1/payments',
  {
    client_id: randomUUID(),
    payment_date: '2026-05-31',
    direction: 'inbound',
    party_type: 'customer',
    party_id: custId,
    amount: openInv?.balance_due ?? '524.00',
    mode: 'cash',
    allocations: [{ invoice_id: openInv?.id, amount: openInv?.balance_due ?? '524.00' }],
  },
  token,
);
log(
  'record receipt',
  receipt.status === 201,
  `${receipt.json.data?.payment_no}, allocated ${receipt.json.data?.allocated}`,
);

const after = await call('GET', `/v1/customers/${custId}/outstanding`, null, token);
log(
  '  balance cleared after receipt',
  after.json.data?.balance_due === '0.00',
  `balance_due now ${after.json.data?.balance_due}`,
);

// With the invoice settled, a fresh credit sale should be allowed again.
const sale3 = await creditSale();
log('  credit sale allowed after settle', sale3.status === 201, `status ${sale3.status}`);

// ─── 10. Masters (form selects) ──────────────────────────────────────────────
const units = await call('GET', '/v1/units', null, token);
log(
  'masters: units',
  units.status === 200 && units.json.data?.length >= 1,
  `${units.json.data?.length} units`,
);
const taxRates = await call('GET', '/v1/tax-rates', null, token);
log(
  'masters: tax-rates',
  taxRates.status === 200 && taxRates.json.data?.length >= 1,
  `${taxRates.json.data?.length} rates`,
);
const banks = await call('GET', '/v1/bank-accounts', null, token);
const cashAcct = banks.json.data?.find((a) => a.type === 'cash');
log(
  'masters: bank-accounts',
  banks.status === 200 && !!cashAcct,
  `${banks.json.data?.length} accounts`,
);

// ─── 11. Receipt to a bank account updates its balance, then void reverses ───
// Fresh customer with no credit block so the sale always goes through.
const cust2Id = randomUUID();
await call(
  'POST',
  '/v1/customers',
  {
    client_id: cust2Id,
    name: 'Cash Buyer',
    type: 'Individual',
    phone: '9000000002',
    gst_reg_type: 'Consumer',
    credit_limit: '0.00',
    block_on_limit_breach: false,
    opening_balance: '0.00',
    status: 'Active',
  },
  token,
);

const sale4 = await call(
  'POST',
  '/v1/invoices',
  {
    client_id: randomUUID(),
    series_id: seed.seriesId,
    branch_id: seed.branchId,
    invoice_date: '2026-05-31',
    customer_id: cust2Id,
    place_of_supply: '29',
    lines: [
      {
        client_id: randomUUID(),
        item_id: seed.items.itemBId,
        qty: '1',
        unit_id: seed.unitIds.LTR,
        rate: '499.00',
        discount_pct: '0',
        tax_rate_id: seed.taxRateIds['GST 5%'],
        location_id: seed.locationId,
        is_free: false,
      },
    ],
  },
  token,
);
const due4 = sale4.json.data?.grand_total ?? '524.00';
const receipt2 = await call(
  'POST',
  '/v1/payments',
  {
    client_id: randomUUID(),
    payment_date: '2026-05-31',
    direction: 'inbound',
    party_type: 'customer',
    party_id: cust2Id,
    amount: due4,
    mode: 'cash',
    account_id: cashAcct?.id,
    allocations: [{ invoice_id: sale4.json.data?.id, amount: due4 }],
  },
  token,
);
log('receipt to cash account', receipt2.status === 201, `status ${receipt2.status}`);

const banksAfter = await call('GET', '/v1/bank-accounts', null, token);
const cashAfter = banksAfter.json.data?.find((a) => a.id === cashAcct?.id);
log(
  '  cash balance increased',
  cashAfter && Number(cashAfter.current_balance) >= Number(due4),
  `balance ${cashAfter?.current_balance}`,
);

const voidRes = await call(
  'POST',
  `/v1/payments/${receipt2.json.data?.id}/void`,
  { reason: 'e2e test void' },
  token,
);
log('void receipt', voidRes.status === 200, `status ${voidRes.status}`);

const banksVoided = await call('GET', '/v1/bank-accounts', null, token);
const cashVoided = banksVoided.json.data?.find((a) => a.id === cashAcct?.id);
log(
  '  cash balance reversed',
  cashVoided && Number(cashVoided.current_balance) === 0,
  `balance ${cashVoided?.current_balance}`,
);

const reopened = await call('GET', `/v1/customers/${cust2Id}/outstanding`, null, token);
log(
  '  invoice reopened after void',
  Number(reopened.json.data?.balance_due) >= Number(due4),
  `balance_due ${reopened.json.data?.balance_due}`,
);

// ─── 12. Edit (PATCH with optimistic concurrency) ────────────────────────────
const itemDetail = await call('GET', `/v1/items/${seed.items.itemAId}`, null, token);
const itemVer = itemDetail.json.data?.row_version;
const itemUpd = await call(
  'PATCH',
  `/v1/items/${seed.items.itemAId}`,
  { pricing: { sale_price: '275.00' } },
  token,
  { 'If-Match': String(itemVer) },
);
log(
  'item PATCH (optimistic)',
  itemUpd.status === 200 && itemUpd.json.data?.row_version === itemVer + 1,
  `v${itemVer} → v${itemUpd.json.data?.row_version}`,
);

// Re-using the stale version must 409.
const stale = await call(
  'PATCH',
  `/v1/items/${seed.items.itemAId}`,
  { pricing: { sale_price: '300.00' } },
  token,
  { 'If-Match': String(itemVer) },
);
log(
  '  stale If-Match rejected',
  stale.status === 409,
  `status ${stale.status}, code ${stale.json.error?.code}`,
);

const custDetail = await call('GET', `/v1/customers/${custId}`, null, token);
const custUpd = await call('PATCH', `/v1/customers/${custId}`, { credit_limit: '5000.00' }, token, {
  'If-Match': String(custDetail.json.data?.row_version),
});
log('customer PATCH', custUpd.status === 200, `status ${custUpd.status}`);

// ─── 13. Vendors + Purchases (inbound stock + payable + moving-avg + dup guard) ─
const vendorId = randomUUID();
const createVendor = await call(
  'POST',
  '/v1/vendors',
  {
    client_id: vendorId,
    name: 'Acme Supplies',
    type: 'Business',
    phone: '9111111111',
    gstin: '29ABCDE1234F1Z5',
    credit_days: 30,
    opening_balance: '0.00',
    status: 'Active',
  },
  token,
);
log('create vendor', createVendor.status === 201, `code ${createVendor.json.data?.vendor_code}`);

// Stock of item A before purchase.
const stockBefore = await call('GET', `/v1/items/${seed.items.itemAId}`, null, token);
const qtyBefore = Number(stockBefore.json.data?.current_stock?.[0]?.qty ?? 0);

const purchase = await call(
  'POST',
  '/v1/purchase-invoices',
  {
    client_id: randomUUID(),
    branch_id: seed.branchId,
    vendor_id: vendorId,
    vendor_invoice_no: 'VINV-001',
    vendor_invoice_date: '2026-05-30',
    voucher_date: '2026-05-31',
    place_of_supply: '29',
    reverse_charge: false,
    receive_location_id: seed.locationId,
    lines: [
      {
        client_id: randomUUID(),
        item_id: seed.items.itemAId,
        qty: '50',
        free_qty: '0',
        unit_id: seed.unitIds.PCS,
        rate: '160.00',
        discount_pct: '0',
        tax_rate_id: seed.taxRateIds['GST 18%'],
        update_item_cost: true,
      },
    ],
  },
  token,
);
log(
  'create purchase',
  purchase.status === 201,
  `${purchase.json.data?.voucher_no}, grand ${purchase.json.data?.grand_total}`,
);

const stockAfter = await call('GET', `/v1/items/${seed.items.itemAId}`, null, token);
const qtyAfter = Number(stockAfter.json.data?.current_stock?.[0]?.qty ?? 0);
log('  stock increased by 50', qtyAfter === qtyBefore + 50, `${qtyBefore} → ${qtyAfter}`);

// Moving-average cost: prior avg 150 over `qtyBefore`, +50 @ 160.
const expectedAvg = ((qtyBefore * 150 + 50 * 160) / (qtyBefore + 50)).toFixed(2);
log(
  '  moving-avg purchase_price updated',
  stockAfter.json.data?.purchase_price === expectedAvg,
  `purchase_price ${stockAfter.json.data?.purchase_price} (expected ${expectedAvg})`,
);

// Vendor payable reflects the purchase grand total.
const vendorDetail = await call('GET', `/v1/vendors/${vendorId}`, null, token);
log(
  '  vendor payable updated',
  vendorDetail.json.data?.payable === purchase.json.data?.grand_total,
  `payable ${vendorDetail.json.data?.payable}`,
);

// Duplicate vendor invoice no. → rejected.
const dupPurchase = await call(
  'POST',
  '/v1/purchase-invoices',
  {
    client_id: randomUUID(),
    branch_id: seed.branchId,
    vendor_id: vendorId,
    vendor_invoice_no: 'VINV-001',
    vendor_invoice_date: '2026-05-30',
    voucher_date: '2026-05-31',
    place_of_supply: '29',
    receive_location_id: seed.locationId,
    lines: [
      {
        client_id: randomUUID(),
        item_id: seed.items.itemAId,
        qty: '1',
        unit_id: seed.unitIds.PCS,
        rate: '160.00',
        tax_rate_id: seed.taxRateIds['GST 18%'],
      },
    ],
  },
  token,
);
log(
  '  duplicate vendor invoice rejected',
  dupPurchase.status === 409,
  `status ${dupPurchase.status}, code ${dupPurchase.json.error?.code}`,
);

// ─── 14. Reports ─────────────────────────────────────────────────────────────
const salesRpt = await call(
  'GET',
  '/v1/reports/sales/summary?date_from=2026-05-01&date_to=2026-05-31',
  null,
  token,
);
log(
  'report: sales summary',
  salesRpt.status === 200 && Number(salesRpt.json.data?.totals?.count) >= 1,
  `${salesRpt.json.data?.totals?.count} invoices, grand ${salesRpt.json.data?.totals?.grand}`,
);

const gstRpt = await call('GET', '/v1/reports/gst/gstr1?period=2026-05', null, token);
log(
  'report: GSTR-1',
  gstRpt.status === 200 && gstRpt.json.data?.hsn_summary?.length >= 1,
  `b2b ${gstRpt.json.data?.b2b?.count}, b2c ${gstRpt.json.data?.b2c?.count}, hsn ${gstRpt.json.data?.hsn_summary?.length}`,
);

const stockRpt = await call('GET', '/v1/reports/stock/valuation', null, token);
log(
  'report: stock valuation',
  stockRpt.status === 200 && Number(stockRpt.json.data?.total_value) > 0,
  `total value ${stockRpt.json.data?.total_value}, ${stockRpt.json.data?.items?.length} items`,
);

const recvRpt = await call('GET', '/v1/reports/financial/receivables', null, token);
log(
  'report: receivables',
  recvRpt.status === 200 && !!recvRpt.json.data?.aging,
  `total due ${recvRpt.json.data?.total_receivable}`,
);

const payRpt = await call('GET', '/v1/reports/financial/payables', null, token);
log(
  'report: payables',
  payRpt.status === 200 && Number(payRpt.json.data?.total_payable) >= 9440,
  `total payable ${payRpt.json.data?.total_payable}`,
);

// ─── 15. Invoice read + print + public verify ───────────────────────────────
const invList = await call('GET', '/v1/invoices?limit=10', null, token);
log(
  'invoice list',
  invList.status === 200 && invList.json.data?.length >= 1,
  `${invList.json.data?.length} invoices`,
);

const invGet = await call('GET', `/v1/invoices/${inv.id}`, null, token);
log(
  'invoice get by id',
  invGet.status === 200 && invGet.json.data?.lines?.length >= 1,
  `${invGet.json.data?.lines?.length} lines, words "${invGet.json.data?.amount_in_words}"`,
);

// Print HTML (raw text response).
const printRes = await fetch(`${BASE}/v1/invoices/${inv.id}/print?paper=a4`, {
  headers: { Authorization: `Bearer ${token}` },
});
const printHtml = await printRes.text();
log(
  'invoice print (A4 HTML)',
  printRes.status === 200 &&
    printHtml.includes('INVOICE') &&
    printHtml.includes(inv.invoice_no) &&
    printHtml.includes('<svg'),
  `${printHtml.length} bytes, has QR svg: ${printHtml.includes('<svg')}`,
);

const thermalRes = await fetch(`${BASE}/v1/invoices/${inv.id}/print?paper=thermal80`, {
  headers: { Authorization: `Bearer ${token}` },
});
log('invoice print (thermal)', thermalRes.status === 200, `status ${thermalRes.status}`);

// Public verify by hash — NO auth.
const verify = await call('GET', `/public/invoices/${inv.invoice_hash}`, null, null);
log(
  'public verify (no auth)',
  verify.status === 200 &&
    verify.json.data?.verified === true &&
    verify.json.data?.invoice_no === inv.invoice_no,
  `verified=${verify.json.data?.verified}, no=${verify.json.data?.invoice_no}`,
);

const verifyBad = await call('GET', '/public/invoices/deadbeef', null, null);
log(
  '  bad hash → not verified',
  verifyBad.json.data?.verified === false,
  `verified=${verifyBad.json.data?.verified}`,
);

// ─── 16. Stock adjustments & transfers ───────────────────────────────────────
// Stock of item B before (opening 60).
async function stockB() {
  const d = await call('GET', `/v1/items/${seed.items.itemBId}`, null, token);
  const loc = d.json.data?.current_stock?.find((s) => s.location_id === seed.locationId);
  return Number(loc?.qty ?? 0);
}
const bBefore = await stockB();

// Adjustment: write off 5 (damaged).
const adj = await call(
  'POST',
  '/v1/stock-adjustments',
  {
    client_id: randomUUID(),
    adjustment_date: '2026-05-31',
    location_id: seed.locationId,
    reason: 'damaged',
    lines: [{ item_id: seed.items.itemBId, qty_change: '-5' }],
  },
  token,
);
log('stock adjustment (-5)', adj.status === 201, `${adj.json.data?.adjustment_no}`);
const bAfterAdj = await stockB();
log('  stock reduced by 5', bAfterAdj === bBefore - 5, `${bBefore} → ${bAfterAdj}`);

// Transfer 10 of item B from main location → second location (direct).
const trf = await call(
  'POST',
  '/v1/stock-transfers',
  {
    client_id: randomUUID(),
    transfer_date: '2026-05-31',
    from_location_id: seed.locationId,
    to_location_id: seed.location2Id,
    mode: 'direct',
    lines: [{ item_id: seed.items.itemBId, qty: '10' }],
  },
  token,
);
log(
  'stock transfer (10 → Back Store)',
  trf.status === 201,
  `${trf.json.data?.transfer_no}, status ${trf.json.data?.status}`,
);

const bAfterTrf = await stockB();
log('  source reduced by 10', bAfterTrf === bAfterAdj - 10, `${bAfterAdj} → ${bAfterTrf}`);

// Destination location now holds 10.
const itemBDetail = await call('GET', `/v1/items/${seed.items.itemBId}`, null, token);
const destQty = Number(
  itemBDetail.json.data?.current_stock?.find((s) => s.location_id === seed.location2Id)?.qty ?? 0,
);
log('  destination has 10', destQty === 10, `dest qty ${destQty}`);

// Transfer to same location must be rejected (schema refine → 400).
const trfBad = await call(
  'POST',
  '/v1/stock-transfers',
  {
    client_id: randomUUID(),
    transfer_date: '2026-05-31',
    from_location_id: seed.locationId,
    to_location_id: seed.locationId,
    mode: 'direct',
    lines: [{ item_id: seed.items.itemBId, qty: '1' }],
  },
  token,
);
log('  same-location transfer rejected', trfBad.status === 400, `status ${trfBad.status}`);

// Stock ledger view for item B.
const ledger = await call('GET', `/v1/stock-ledger?item_id=${seed.items.itemBId}`, null, token);
log(
  'stock ledger view',
  ledger.status === 200 && ledger.json.data?.entries?.length >= 3,
  `${ledger.json.data?.entries?.length} entries, closing ${ledger.json.data?.summary?.closing}`,
);

// ─── 17. Credit note / sales return (adjust to ledger) ───────────────────────
// sale3 (item B, ₹524, unpaid credit sale for custId) — return it fully.
const sale3Id = sale3.json.data?.id;
const sale3Full = await call('GET', `/v1/invoices/${sale3Id}`, null, token);
const cnLine = sale3Full.json.data?.lines?.[0];
const outBefore = await call('GET', `/v1/customers/${custId}/outstanding`, null, token);
const cnStockBefore = await stockB();

const creditNote = await call(
  'POST',
  '/v1/credit-notes',
  {
    client_id: randomUUID(),
    branch_id: seed.branchId,
    credit_note_date: '2026-05-31',
    original_invoice_id: sale3Id,
    reason: 'damaged',
    refund_mode: 'adjust_ledger',
    lines: [
      {
        item_id: cnLine?.item_id,
        original_line_id: cnLine?.id,
        qty: cnLine?.qty,
        unit_id: cnLine?.unit_id,
        rate: cnLine?.rate,
        tax_rate_id: cnLine?.tax_rate_id,
        location_id: cnLine?.location_id,
        restore_stock: true,
      },
    ],
  },
  token,
);
log(
  'create credit note',
  creditNote.status === 201,
  `${creditNote.json.data?.credit_note_no}, grand ${creditNote.json.data?.grand_total}`,
);

const cnStockAfter = await stockB();
log(
  '  stock restored (+1)',
  cnStockAfter === cnStockBefore + 1,
  `${cnStockBefore} → ${cnStockAfter}`,
);

const outAfter = await call('GET', `/v1/customers/${custId}/outstanding`, null, token);
log(
  '  receivable reduced by 524',
  Number(outBefore.json.data?.balance_due) - Number(outAfter.json.data?.balance_due) === 524,
  `${outBefore.json.data?.balance_due} → ${outAfter.json.data?.balance_due}`,
);

const sale3After = await call('GET', `/v1/invoices/${sale3Id}`, null, token);
log(
  '  original invoice fully_returned',
  sale3After.json.data?.status === 'fully_returned',
  `status ${sale3After.json.data?.status}`,
);

// Over-return guard: returning again must be rejected.
const cnAgain = await call(
  'POST',
  '/v1/credit-notes',
  {
    client_id: randomUUID(),
    branch_id: seed.branchId,
    credit_note_date: '2026-05-31',
    original_invoice_id: sale3Id,
    reason: 'damaged',
    refund_mode: 'adjust_ledger',
    lines: [
      {
        item_id: cnLine?.item_id,
        original_line_id: cnLine?.id,
        qty: cnLine?.qty,
        unit_id: cnLine?.unit_id,
        rate: cnLine?.rate,
        tax_rate_id: cnLine?.tax_rate_id,
        location_id: cnLine?.location_id,
        restore_stock: true,
      },
    ],
  },
  token,
);
log(
  '  over-return rejected',
  cnAgain.status === 400,
  `status ${cnAgain.status}, code ${cnAgain.json.error?.code}`,
);

console.info('\nE2E done.');
