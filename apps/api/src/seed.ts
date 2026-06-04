import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load root .env.local for DATABASE_URL (Node 21+).
const envPath = resolve(process.cwd(), '../../.env.local');
if (existsSync(envPath)) process.loadEnvFile(envPath);

import { createDbClient } from '@counter/db';
import {
  bank_accounts,
  branches,
  invoice_series,
  items,
  locations,
  organizations,
  payment_modes,
  stock_ledger,
  tax_rates,
  units,
  user_branch_access,
  users,
} from '@counter/db';
import * as argon2 from 'argon2';
import { uuidv7 } from 'uuidv7';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — check .env.local');
  process.exit(1);
}

const id = () => uuidv7();

// Fixed IDs for core entities so a valid access token survives `seed:fresh`
// (auth verifies the RS256 signature + reads claims; the org/user rows persist
// with these same IDs across reseeds, so no re-login is forced).
const FIXED = {
  org: '00000000-0000-7000-8000-000000000001',
  user: '00000000-0000-7000-8000-000000000002',
  branch: '00000000-0000-7000-8000-000000000003',
  location: '00000000-0000-7000-8000-000000000004',
  series: '00000000-0000-7000-8000-000000000005',
  superAdminUser: '00000000-0000-7000-8000-000000000099',
} as const;

export async function runSeed() {
  const db = createDbClient(DATABASE_URL!);

  // ─── Organization ───────────────────────────────────────────────────────
  const orgId = FIXED.org;
  const orgCode = 'COCOGLO-01';
  await db.insert(organizations).values({
    id: orgId,
    name: 'CocoGlo Stores',
    legal_name: 'CocoGlo Retail Pvt Ltd',
    gstin: '33ABCDE1234F1Z5', // TN State Code is 33
    state_code: '33', // Tamil Nadu
    address: 'Bhavani, Tamil Nadu, India',
    phone: '+919789560316',
    email: 'hello@cocoglo.in',
    industry_profile: 'retail',
    org_code: orgCode,
    upi_id: 'deepikarajadurai94@okicici',
  });

  // ─── Branch + Location ──────────────────────────────────────────────────
  const branchId = FIXED.branch;
  await db.insert(branches).values({
    id: branchId,
    org_id: orgId,
    name: 'Main Branch',
    code: 'BR1',
    state_code: '33',
    is_default: true,
  });

  const locationId = FIXED.location;
  await db.insert(locations).values({
    id: locationId,
    org_id: orgId,
    branch_id: branchId,
    name: 'Main Store',
    code: 'LOC1',
    is_default: true,
  });

  const location2Id = id();
  await db.insert(locations).values({
    id: location2Id,
    org_id: orgId,
    branch_id: branchId,
    name: 'Back Store',
    code: 'LOC2',
    is_default: false,
  });

  // ─── Owner user (PIN 1234) ──────────────────────────────────────────────
  const userId = FIXED.user;
  const phone = '9876543210';
  const pin = '1234';
  const pinHash = await argon2.hash(pin, { type: argon2.argon2id });
  await db.insert(users).values({
    id: userId,
    org_id: orgId,
    name: 'Ravi (Owner)',
    phone,
    email: 'ravi@cocoglo.example',
    role: 'owner',
    pin_hash: pinHash,
    force_pin_change: false,
    is_salesperson: true,
    status: 'Active',
    default_branch_id: branchId,
    created_by: userId,
    updated_by: userId,
  });

  await db.insert(user_branch_access).values({
    id: id(),
    org_id: orgId,
    user_id: userId,
    branch_id: branchId,
  });

  // ─── Super Admin user (Phone 9999999999, PIN 1234) ────────────────────────
  const superAdminId = FIXED.superAdminUser;
  const superAdminPhone = '9999999999';
  const superAdminHash = await argon2.hash('1234', { type: argon2.argon2id });
  await db.insert(users).values({
    id: superAdminId,
    org_id: orgId,
    name: 'System Administrator',
    phone: superAdminPhone,
    email: 'admin@counter.example',
    role: 'super_admin',
    pin_hash: superAdminHash,
    force_pin_change: false,
    is_salesperson: false,
    status: 'Active',
    default_branch_id: branchId,
    created_by: superAdminId,
    updated_by: superAdminId,
  });

  await db.insert(user_branch_access).values({
    id: id(),
    org_id: orgId,
    user_id: superAdminId,
    branch_id: branchId,
  });

  // ─── Tax rates (GST, effective from GST rollout) ────────────────────────
  const gstDefs = [
    { name: 'GST 0%', total: '0', half: '0', igst: '0' },
    { name: 'GST 5%', total: '5', half: '2.5', igst: '5' },
    { name: 'GST 12%', total: '12', half: '6', igst: '12' },
    { name: 'GST 18%', total: '18', half: '9', igst: '18' },
    { name: 'GST 28%', total: '28', half: '14', igst: '28' },
  ];
  const taxRateIds: Record<string, string> = {};
  for (const g of gstDefs) {
    const taxId = id();
    taxRateIds[g.name] = taxId;
    await db.insert(tax_rates).values({
      id: taxId,
      org_id: orgId,
      name: g.name,
      total_rate: g.total,
      cgst_rate: g.half,
      sgst_rate: g.half,
      igst_rate: g.igst,
      cess_rate: '0',
      effective_from: '2017-07-01',
    });
  }

  // ─── Units ──────────────────────────────────────────────────────────────
  const unitDefs = [
    { name: 'Pieces', abbr: 'PCS' },
    { name: 'Kilogram', abbr: 'KG' },
    { name: 'Litre', abbr: 'LTR' },
    { name: 'Box', abbr: 'BOX' },
  ];
  const unitIds: Record<string, string> = {};
  for (const u of unitDefs) {
    const uId = id();
    unitIds[u.abbr] = uId;
    await db.insert(units).values({
      id: uId,
      org_id: orgId,
      name: u.name,
      abbreviation: u.abbr,
    });
  }

  // ─── Invoice series ─────────────────────────────────────────────────────
  const seriesId = FIXED.series;
  await db.insert(invoice_series).values({
    id: seriesId,
    org_id: orgId,
    name: 'Main Sales',
    document_type: 'invoice',
    prefix: 'INV-',
    suffix: '/2026-27',
    number_padding: 4,
    starting_number: 1,
    next_number: 1,
    reset_on_fy: true,
    is_default: true,
    is_active: true,
  });

  // ─── Payment modes ──────────────────────────────────────────────────────
  const modeDefs = [
    { name: 'Cash', type: 'cash' },
    { name: 'Card', type: 'card' },
    { name: 'UPI', type: 'upi' },
    { name: 'Bank Transfer', type: 'bank' },
  ];
  let order = 0;
  for (const m of modeDefs) {
    await db.insert(payment_modes).values({
      id: id(),
      org_id: orgId,
      name: m.name,
      type: m.type,
      display_order: order++,
    });
  }

  // ─── Bank / cash accounts ───────────────────────────────────────────────
  await db.insert(bank_accounts).values([
    {
      id: id(),
      org_id: orgId,
      name: 'Cash Drawer',
      type: 'cash',
      current_balance: '0.00',
      is_default: true,
    },
    {
      id: id(),
      org_id: orgId,
      name: 'HDFC Current A/c',
      bank_name: 'HDFC Bank',
      type: 'bank',
      current_balance: '0.00',
      is_default: false,
    },
  ]);

  // ─── Sample items ───────────────────────────────────────────────────────
  const itemAId = id();
  await db.insert(items).values({
    id: itemAId,
    org_id: orgId,
    sku: 'ITM-00001',
    name: 'Coconut Body Oil 200ml',
    primary_unit_id: unitIds['PCS']!,
    tax_rate_id: taxRateIds['GST 18%']!,
    hsn_code: '3304',
    mrp: '299.00',
    sale_price: '249.00',
    purchase_price: '150.00',
    track_inventory: true,
    status: 'active',
    created_by: userId,
    updated_by: userId,
  });

  const itemBId = id();
  await db.insert(items).values({
    id: itemBId,
    org_id: orgId,
    sku: 'ITM-00002',
    name: 'Virgin Coconut Oil 1L',
    primary_unit_id: unitIds['LTR']!,
    tax_rate_id: taxRateIds['GST 5%']!,
    hsn_code: '1513',
    mrp: '550.00',
    sale_price: '499.00',
    purchase_price: '320.00',
    track_inventory: true,
    status: 'active',
    created_by: userId,
    updated_by: userId,
  });

  // ─── Opening stock (append-only ledger, §1.2) ───────────────────────────
  const openingStock = [
    { itemId: itemAId, qty: '100.000', rate: '150.00' },
    { itemId: itemBId, qty: '60.000', rate: '320.00' },
  ];
  for (const os of openingStock) {
    await db.insert(stock_ledger).values({
      id: id(),
      org_id: orgId,
      item_id: os.itemId,
      location_id: locationId,
      txn_type: 'opening',
      txn_date: new Date('2026-04-01T00:00:00Z'),
      qty_in: os.qty,
      qty_out: '0',
      balance_qty: os.qty,
      rate: os.rate,
      value: String(Number(os.qty) * Number(os.rate)),
      ref_table: 'items',
      ref_id: os.itemId,
      created_by: userId,
    });
  }

  const output = {
    orgId,
    orgCode,
    login: { phone, pin },
    branchId,
    locationId,
    location2Id,
    seriesId,
    unitIds,
    taxRateIds,
    items: { itemAId, itemBId },
  };

  const outPath = resolve(process.cwd(), 'seed-output.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.info('\n✓ Seed complete. Key IDs written to apps/api/seed-output.json\n');
  console.info(`  Org:      ${orgId} (code ${orgCode})`);
  console.info(`  Login:    phone ${phone} / PIN ${pin}`);
  console.info(`  Branch:   ${branchId}`);
  console.info(`  Location: ${locationId}`);
  console.info(`  Series:   ${seriesId}`);
  console.info(`  Items:    ${itemAId}, ${itemBId}`);

  return output;
}

// Run directly (not when imported by reset.ts).
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
