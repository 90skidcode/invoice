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
import { ORGANIZATIONS as ORG_CONFIG } from '@counter/schemas';
import * as argon2 from 'argon2';
import { uuidv7 } from 'uuidv7';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — check .env.local');
  process.exit(1);
}

// Use org codes from schema config (can be overridden via ORG_CODE env var)
const ORG_CODE = process.env['ORG_CODE'] || ORG_CONFIG.COCOGLO.code;

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
  superAdminOrg: '00000000-0000-7000-8000-000000000098',
  superAdminBranch: '00000000-0000-7000-8000-000000000097',
} as const;

export async function runSeed() {
  const db = createDbClient(DATABASE_URL!);

  // ─── System Admin Organization ──────────────────────────────────────────
  const sysOrgId = FIXED.superAdminOrg;
  await db.insert(organizations).values({
    id: sysOrgId,
    name: 'System Admin Platform',
    legal_name: 'System Admin Platform Ltd',
    state_code: '33',
    org_code: ORG_CODE,
    plan: 'enterprise',
  });

  const sysBranchId = FIXED.superAdminBranch;
  await db.insert(branches).values({
    id: sysBranchId,
    org_id: sysOrgId,
    name: 'System HQ',
    code: 'SYS',
    state_code: '33',
    is_default: true,
  });

  // ─── Organization ───────────────────────────────────────────────────────
  const orgId = FIXED.org;
  await db.insert(organizations).values({
    id: orgId,
    name: 'Cocoglo',
    legal_name: 'Cocoglo Retail Pvt Ltd',
    gstin: '33ABCDE1234F1Z5', // TN State Code is 33
    state_code: '33', // Tamil Nadu
    address: 'Bhavani, Tamil Nadu, India',
    phone: '+919789560316',
    email: 'hello@cocoglo.in',
    industry_profile: 'retail',
    org_code: ORG_CODE,
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
    org_id: sysOrgId,
    name: 'System Administrator',
    phone: superAdminPhone,
    email: 'admin@counter.example',
    role: 'super_admin',
    pin_hash: superAdminHash,
    force_pin_change: false,
    is_salesperson: false,
    status: 'Active',
    default_branch_id: sysBranchId,
    created_by: superAdminId,
    updated_by: superAdminId,
  });

  await db.insert(user_branch_access).values({
    id: id(),
    org_id: sysOrgId,
    user_id: superAdminId,
    branch_id: sysBranchId,
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

  const output = {
    orgId,
    orgCode: ORG_CODE,
    login: { phone, pin },
    branchId,
    locationId,
    location2Id,
    seriesId,
    unitIds,
    taxRateIds,
    items: {},
  };

  const outPath = resolve(process.cwd(), 'seed-output.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.info('\n✓ Seed complete. Key IDs written to apps/api/seed-output.json\n');
  console.info(`  Org:      ${orgId} (code ${ORG_CODE})`);
  console.info(`  Login:    phone ${phone} / PIN ${pin}`);
  console.info(`  Branch:   ${branchId}`);
  console.info(`  Location: ${locationId}`);
  console.info(`  Series:   ${seriesId}`);

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
