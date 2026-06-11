import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const sql = postgres(DATABASE_URL, { ssl: 'require' });

try {
  console.log('Checking data in database...\n');

  // Check invoices
  const invoices = await sql`
    SELECT COUNT(*) as count, SUM(CAST(grand_total AS NUMERIC)) as total
    FROM invoices
    WHERE deleted_at IS NULL
  `;
  console.log('Total Invoices:', invoices[0]);

  // Check today's sales
  const today = new Date().toISOString().split('T')[0];
  const todaysSales = await sql`
    SELECT COUNT(*) as count, SUM(CAST(grand_total AS NUMERIC)) as total
    FROM invoices
    WHERE deleted_at IS NULL AND DATE(invoice_date) = ${today}
  `;
  console.log('Today\'s Sales:', todaysSales[0]);

  // Check stock
  const stock = await sql`
    SELECT SUM(CAST(balance_qty AS NUMERIC)) as total_qty
    FROM stock_ledger
    WHERE deleted_at IS NULL
  `;
  console.log('Stock Ledger:', stock[0]);

  // Check receivables
  const receivables = await sql`
    SELECT SUM(CAST(balance_due AS NUMERIC)) as total_due
    FROM invoices
    WHERE deleted_at IS NULL AND payment_status = 'unpaid'
  `;
  console.log('Receivables:', receivables[0]);

  // Check items
  const items = await sql`SELECT COUNT(*) as count FROM items WHERE deleted_at IS NULL`;
  console.log('Items:', items[0]);

  await sql.end();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
