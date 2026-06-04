// Confirms the invoice transaction wrote header + lines + stock_ledger + audit.
// Run with: node --env-file-if-exists=../../.env.local check-e2e.mjs
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const seed = JSON.parse(
  readFileSync(new URL('../../apps/api/seed-output.json', import.meta.url)),
);
const orgId = seed.orgId;

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1 });

try {
  const [inv] = await sql`SELECT count(*)::int AS n FROM invoices WHERE org_id = ${orgId}`;
  const [lines] = await sql`
    SELECT count(*)::int AS n FROM invoice_lines WHERE org_id = ${orgId}`;
  const [ledger] = await sql`
    SELECT count(*)::int AS n FROM stock_ledger
    WHERE org_id = ${orgId} AND txn_type = 'sale'`;
  const [payments] = await sql`SELECT count(*)::int AS n FROM payments WHERE org_id = ${orgId}`;
  const [audit] = await sql`
    SELECT count(*)::int AS n FROM audit_log
    WHERE org_id = ${orgId} AND entity_table = 'invoices'`;

  const [latest] = await sql`
    SELECT invoice_no, grand_total, payment_status, taxable_total, cgst_total, sgst_total, round_off
    FROM invoices WHERE org_id = ${orgId} ORDER BY created_at DESC LIMIT 1`;

  console.info('\n── DB state for org ──');
  console.info(`  invoices:          ${inv.n}`);
  console.info(`  invoice_lines:     ${lines.n}`);
  console.info(`  stock_ledger sale: ${ledger.n}`);
  console.info(`  payments:          ${payments.n}`);
  console.info(`  audit (invoices):  ${audit.n}`);
  if (latest) {
    console.info('\n── Latest invoice ──');
    console.info(`  ${latest.invoice_no}  grand=${latest.grand_total}  status=${latest.payment_status}`);
    console.info(`  taxable=${latest.taxable_total} cgst=${latest.cgst_total} sgst=${latest.sgst_total} round_off=${latest.round_off}`);
  }

  // Prove the append-only trigger works: try to UPDATE stock_ledger (must fail).
  let blocked = false;
  try {
    await sql`UPDATE stock_ledger SET note = 'tamper' WHERE org_id = ${orgId}`;
  } catch (e) {
    blocked = true;
    console.info(`\n✓ stock_ledger UPDATE rejected by trigger: ${e.message.split('\n')[0]}`);
  }
  if (!blocked) console.info('\n✗ stock_ledger UPDATE was NOT blocked!');
} finally {
  await sql.end();
}
