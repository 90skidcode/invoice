import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 10,
});

function generateUUID() {
  return crypto.randomUUID();
}

const itemsToCreate = [
  // Finished good
  { sku: 'ROSE-BAR-1500', name: 'Rose bath bar', is_finished_good: true },
  // Raw materials
  { sku: 'COCONUT-OIL', name: 'Coconut oil' },
  { sku: 'INFUSE-COCONUT', name: 'Infuse coconut' },
  { sku: 'SHEABUTTER', name: 'Sheabutter' },
  { sku: 'ALMOND-OIL', name: 'Almond oil' },
  { sku: 'CASTOR-OIL', name: 'Castor oil' },
  { sku: 'KUMKUMADI-OIL', name: 'Kumkumadi oil' },
  { sku: 'NAOH', name: 'NaOH' },
  { sku: 'WATER', name: 'Water' },
  { sku: 'SODIUM-LACTATE', name: 'Sodium Lactate' },
  { sku: 'COLOUR', name: 'Colour' },
  { sku: 'FRAGRANCE', name: 'Fragrance' },
  { sku: 'CARROT-BEETROOT', name: 'Carrot/Beetroot' },
  { sku: 'OLIVE-OIL', name: 'Olive oil' },
];

async function main() {
  try {
    // Get the first organization
    const orgs = await sql`SELECT id, name, created_by FROM organizations LIMIT 1`;
    if (!orgs || orgs.length === 0) {
      console.error('No organization found');
      process.exit(1);
    }

    const org = orgs[0];
    console.log(`Using organization: ${org.name} (${org.id})`);

    // Get or create gram unit
    let units = await sql`SELECT id FROM units WHERE org_id = ${org.id} AND abbreviation = 'g'`;
    let gramUnitId;
    if (units.length > 0) {
      gramUnitId = units[0].id;
      console.log(`Found gram unit: ${gramUnitId}`);
    } else {
      gramUnitId = crypto.randomUUID();
      await sql`INSERT INTO units (id, org_id, name, abbreviation, is_active) VALUES (${gramUnitId}, ${org.id}, 'Gram', 'g', true)`;
      console.log(`Created gram unit: ${gramUnitId}`);
    }

    // Get or create 0% tax rate
    let taxRates = await sql`SELECT id FROM tax_rates WHERE org_id = ${org.id} AND total_rate = '0'`;
    let taxRateId;
    if (taxRates.length > 0) {
      taxRateId = taxRates[0].id;
      console.log(`Found 0% tax rate: ${taxRateId}`);
    } else {
      taxRateId = crypto.randomUUID();
      await sql`INSERT INTO tax_rates (id, org_id, name, total_rate, cgst_rate, sgst_rate, igst_rate, cess_rate, effective_from, is_active)
                VALUES (${taxRateId}, ${org.id}, 'No Tax', '0', '0', '0', '0', '0', NOW(), true)`;
      console.log(`Created 0% tax rate: ${taxRateId}`);
    }

    console.log('\n--- Creating items ---');
    let createdCount = 0;
    let existingCount = 0;

    for (const itemData of itemsToCreate) {
      // Check if item exists
      const existing = await sql`SELECT id FROM items
                                  WHERE org_id = ${org.id} AND sku = ${itemData.sku} AND deleted_at IS NULL`;

      if (existing.length > 0) {
        console.log(`✓ ${itemData.sku}: ${itemData.name} (already exists)`);
        existingCount++;
      } else {
        const itemId = crypto.randomUUID();
        await sql`INSERT INTO items
                  (id, org_id, sku, name, primary_unit_id, tax_rate_id, sale_price, is_finished_good, track_inventory, created_by, updated_by)
                  VALUES (${itemId}, ${org.id}, ${itemData.sku}, ${itemData.name}, ${gramUnitId}, ${taxRateId}, '0', ${itemData.is_finished_good || false}, true, ${org.created_by}, ${org.created_by})`;
        console.log(`✓ Created: ${itemData.sku} (${itemData.name})`);
        createdCount++;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Created: ${createdCount} items`);
    console.log(`Already existed: ${existingCount} items`);
    console.log('✓ All items ready for BOM creation!');

    await sql.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
