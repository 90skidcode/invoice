import postgres from 'postgres';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, {
  ssl: 'require',
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const itemsToCreate = [
  { sku: 'ROSE-BAR-1500', name: 'Rose bath bar', is_finished_good: true },
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

const recipeLines = [
  { sku: 'COCONUT-OIL', qty: '435' },
  { sku: 'INFUSE-COCONUT', qty: '200' },
  { sku: 'SHEABUTTER', qty: '375' },
  { sku: 'ALMOND-OIL', qty: '90' },
  { sku: 'CASTOR-OIL', qty: '90' },
  { sku: 'KUMKUMADI-OIL', qty: '30' },
  { sku: 'NAOH', qty: '209.69' },
  { sku: 'WATER', qty: '425.74' },
  { sku: 'SODIUM-LACTATE', qty: '30' },
  { sku: 'COLOUR', qty: '30' },
  { sku: 'FRAGRANCE', qty: '45' },
  { sku: 'CARROT-BEETROOT', qty: '1' },
  { sku: 'OLIVE-OIL', qty: '510' },
];

async function main() {
  try {
    // Get org
    const orgs = await sql`SELECT id, name FROM organizations LIMIT 1`;
    if (!orgs || orgs.length === 0) {
      console.error('No organization found');
      process.exit(1);
    }
    const org = orgs[0];
    console.log(`Using org: ${org.name}`);

    // Get a user
    const users = await sql`SELECT id FROM users WHERE org_id = ${org.id} LIMIT 1`;
    if (!users || users.length === 0) {
      console.error('No user found in org');
      process.exit(1);
    }
    const userId = users[0].id;

    // Get or create gram unit
    let gramUnits = await sql`SELECT id FROM units WHERE org_id = ${org.id} AND abbreviation = 'g'`;
    let gramUnitId = gramUnits.length > 0 ? gramUnits[0].id : randomUUID();
    if (gramUnits.length === 0) {
      await sql`INSERT INTO units (id, org_id, name, abbreviation, is_active) VALUES (${gramUnitId}, ${org.id}, 'Gram', 'g', true)`;
      console.log('Created gram unit');
    } else {
      console.log('Found gram unit');
    }

    // Get or create 0% tax rate
    let taxRates = await sql`SELECT id FROM tax_rates WHERE org_id = ${org.id} AND total_rate = '0'`;
    let taxRateId = taxRates.length > 0 ? taxRates[0].id : randomUUID();
    if (taxRates.length === 0) {
      await sql`INSERT INTO tax_rates (id, org_id, name, total_rate, cgst_rate, sgst_rate, igst_rate, cess_rate, effective_from, is_active)
                VALUES (${taxRateId}, ${org.id}, 'No Tax', '0', '0', '0', '0', '0', NOW(), true)`;
      console.log('Created 0% tax rate');
    } else {
      console.log('Found 0% tax rate');
    }

    // Create items
    console.log('\nCreating items...');
    const createdItems = {};

    for (const itemData of itemsToCreate) {
      // Check if exists
      const existing = await sql`SELECT id FROM items WHERE org_id = ${org.id} AND sku = ${itemData.sku} AND deleted_at IS NULL`;

      if (existing.length > 0) {
        createdItems[itemData.sku] = existing[0].id;
        console.log(`✓ ${itemData.sku} (exists)`);
        continue;
      }

      const itemId = randomUUID();
      await sql`
        INSERT INTO items (id, org_id, sku, name, primary_unit_id, tax_rate_id, sale_price, is_finished_good, track_inventory, created_by, updated_by)
        VALUES (${itemId}, ${org.id}, ${itemData.sku}, ${itemData.name}, ${gramUnitId}, ${taxRateId}, '0', ${itemData.is_finished_good ? true : false}, true, ${userId}, ${userId})
      `;
      createdItems[itemData.sku] = itemId;
      console.log(`✓ Created ${itemData.sku}`);
    }

    // Create BOM
    const finishedGood = createdItems['ROSE-BAR-1500'];
    if (!finishedGood) {
      console.error('Rose bath bar not found');
      process.exit(1);
    }

    console.log('\nCreating BOM...');
    const bomId = randomUUID();
    await sql`
      INSERT INTO bom_headers (id, org_id, finished_item_id, version, name, output_qty, output_unit_id, labor_cost, overhead_cost, notes, is_active, status, created_by, updated_by)
      VALUES (${bomId}, ${org.id}, ${finishedGood}, 1, 'Rose bath bar recipe', '1500', ${gramUnitId}, '250', '0', 'Rose bath bar - 1500g batch', true, 'active', ${userId}, ${userId})
    `;

    // Add BOM lines
    for (let i = 0; i < recipeLines.length; i++) {
      const line = recipeLines[i];
      const rawItemId = createdItems[line.sku];
      if (!rawItemId) {
        console.error(`Item ${line.sku} not found`);
        continue;
      }

      await sql`
        INSERT INTO bom_items (id, org_id, bom_header_id, line_no, raw_item_id, qty, unit_id, wastage_pct)
        VALUES (${randomUUID()}, ${org.id}, ${bomId}, ${i + 1}, ${rawItemId}, ${line.qty}, ${gramUnitId}, '0')
      `;
    }

    console.log(`✓ Created BOM with ${recipeLines.length} lines`);
    console.log('\n✅ Setup complete!');
    console.log(`   - Created ${Object.keys(createdItems).length} items`);
    console.log(`   - Created 1 BOM (Rose bath bar recipe)`);

    await sql.end();
  } catch (error) {
    console.error('Error:', error.message || error);
    process.exit(1);
  }
}

main();
