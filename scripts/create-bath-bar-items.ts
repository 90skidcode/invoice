import { createDbClient, items, units, tax_rates, organizations } from '@counter/db';
import { eq, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const db = createDbClient(DATABASE_URL);

interface BathBarItem {
  sku: string;
  name: string;
  is_finished_good?: boolean;
}

const itemsToCreate: BathBarItem[] = [
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
    // Get the first organization (assuming user has at least one)
    const org = await db
      .select()
      .from(organizations)
      .limit(1);

    if (!org || org.length === 0) {
      console.error('No organization found. Please create one first.');
      process.exit(1);
    }

    const orgId = org[0].id;
    console.log(`Using organization: ${org[0].name} (${orgId})`);

    // Get units
    const unitList = await db
      .select()
      .from(units)
      .where(eq(units.org_id, orgId));

    const gramUnit = unitList.find((u) => u.abbreviation === 'g' || u.name.toLowerCase().includes('gram'));
    if (!gramUnit) {
      console.error('Gram unit not found. Creating it...');
      const newUnitId = uuidv7();
      await db.insert(units).values({
        id: newUnitId,
        org_id: orgId,
        name: 'Gram',
        abbreviation: 'g',
        is_active: true,
      });
      console.log(`Created gram unit: ${newUnitId}`);
    }

    const finalGramUnit = gramUnit || { id: uuidv7(), abbreviation: 'g' };

    // Get tax rates
    const taxRateList = await db
      .select()
      .from(tax_rates)
      .where(eq(tax_rates.org_id, orgId));

    const zeroTaxRate = taxRateList.find((tr) => Number(tr.total_rate) === 0);
    if (!zeroTaxRate) {
      console.error('0% tax rate not found. Creating it...');
      const newTaxRateId = uuidv7();
      await db.insert(tax_rates).values({
        id: newTaxRateId,
        org_id: orgId,
        name: 'No Tax',
        total_rate: '0',
        cgst_rate: '0',
        sgst_rate: '0',
        igst_rate: '0',
        cess_rate: '0',
        effective_from: new Date('2020-01-01'),
        is_active: true,
      });
      console.log(`Created 0% tax rate: ${newTaxRateId}`);
    }

    const finalTaxRate = zeroTaxRate || { id: uuidv7() };

    // Check and create items
    console.log('\n--- Checking items ---');
    let createdCount = 0;
    let existingCount = 0;

    for (const itemData of itemsToCreate) {
      // Check if item already exists
      const existing = await db
        .select()
        .from(items)
        .where(
          (t) =>
            sql`${t.org_id} = ${orgId} AND ${t.sku} = ${itemData.sku} AND ${t.deleted_at} IS NULL`,
        );

      if (existing.length > 0) {
        console.log(`✓ ${itemData.sku}: ${itemData.name} (already exists)`);
        existingCount++;
      } else {
        // Create the item
        const itemId = uuidv7();
        await db.insert(items).values({
          id: itemId,
          org_id: orgId,
          sku: itemData.sku,
          name: itemData.name,
          primary_unit_id: finalGramUnit.id,
          tax_rate_id: finalTaxRate.id,
          sale_price: '0',
          is_finished_good: itemData.is_finished_good ?? false,
          track_inventory: true,
          created_by: org[0].created_by,
          updated_by: org[0].created_by,
        });
        console.log(`✓ Created: ${itemData.sku} (${itemData.name})`);
        createdCount++;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Created: ${createdCount} items`);
    console.log(`Already existed: ${existingCount} items`);
    console.log('✓ All items ready for BOM creation!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
