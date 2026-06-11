import { createDbClient, organizations, users, items, units, tax_rates, bom_headers, bom_items } from '@counter/db';
import { eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const db = createDbClient(DATABASE_URL);

interface ItemData {
  sku: string;
  name: string;
  is_finished_good?: boolean;
}

const itemsToCreate: ItemData[] = [
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

interface RecipeLine {
  sku: string;
  qty: string;
  wastage_pct?: string;
}

const recipeLines: RecipeLine[] = [
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
    // Get organization
    const orgs = await db.select().from(organizations).limit(1);
    if (!orgs || orgs.length === 0) {
      console.error('No organization found');
      process.exit(1);
    }
    const orgId = orgs[0].id;
    const createdBy = orgs[0].created_by;
    console.log(`Using org: ${orgs[0].name}`);

    // Get or create units
    let gramUnit = await db
      .select()
      .from(units)
      .where(eq(units.org_id, orgId))
      .then((u) => u.find((x) => x.abbreviation === 'g'));

    if (!gramUnit) {
      const gramId = uuidv7();
      await db.insert(units).values({
        id: gramId,
        org_id: orgId,
        name: 'Gram',
        abbreviation: 'g',
        is_active: true,
      });
      gramUnit = { id: gramId, abbreviation: 'g' } as any;
      console.log('Created gram unit');
    }

    // Get or create 0% tax rate
    let taxRate = await db
      .select()
      .from(tax_rates)
      .where(eq(tax_rates.org_id, orgId))
      .then((t) => t.find((x) => Number(x.total_rate) === 0));

    if (!taxRate) {
      const taxId = uuidv7();
      await db.insert(tax_rates).values({
        id: taxId,
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
      taxRate = { id: taxId } as any;
      console.log('Created 0% tax rate');
    }

    // Create items
    console.log('\nCreating items...');
    const createdItems: Record<string, string> = {};

    for (const itemData of itemsToCreate) {
      const existing = await db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.org_id, orgId))
        .then((r) => r.find((x) => x.id));

      if (existing) {
        // Check by SKU
        const bySkuQuery = await db
          .select({ id: items.id })
          .from(items)
          .where(eq(items.org_id, orgId));
        const bySku = bySkuQuery.find((x) => x.id === itemData.sku);
        if (bySku) {
          createdItems[itemData.sku] = bySku.id;
          console.log(`✓ ${itemData.sku} (exists)`);
          continue;
        }
      }

      const itemId = uuidv7();
      await db.insert(items).values({
        id: itemId,
        org_id: orgId,
        sku: itemData.sku,
        name: itemData.name,
        primary_unit_id: gramUnit.id,
        tax_rate_id: taxRate.id,
        sale_price: '0',
        is_finished_good: itemData.is_finished_good ?? false,
        track_inventory: true,
        created_by: createdBy,
        updated_by: createdBy,
      });
      createdItems[itemData.sku] = itemId;
      console.log(`✓ Created ${itemData.sku}`);
    }

    // Get finished good and raw materials for BOM
    const finishedGood = createdItems['ROSE-BAR-1500'];
    if (!finishedGood) {
      console.error('Rose bath bar not created');
      process.exit(1);
    }

    console.log('\nCreating BOM...');
    const bomId = uuidv7();
    await db.insert(bom_headers).values({
      id: bomId,
      org_id: orgId,
      finished_item_id: finishedGood,
      version: 1,
      name: 'Rose bath bar recipe',
      output_qty: '1500',
      output_unit_id: gramUnit.id,
      labor_cost: '250',
      overhead_cost: '0',
      notes: 'Rose bath bar - 1500g batch',
      is_active: true,
      status: 'active',
      created_by: createdBy,
      updated_by: createdBy,
    });

    // Add BOM lines
    for (let i = 0; i < recipeLines.length; i++) {
      const line = recipeLines[i];
      const rawItemId = createdItems[line.sku];
      if (!rawItemId) {
        console.error(`Item ${line.sku} not found`);
        continue;
      }

      await db.insert(bom_items).values({
        id: uuidv7(),
        org_id: orgId,
        bom_header_id: bomId,
        line_no: i + 1,
        raw_item_id: rawItemId,
        qty: line.qty,
        unit_id: gramUnit.id,
        wastage_pct: line.wastage_pct || '0',
      });
    }

    console.log(`✓ Created BOM with ${recipeLines.length} lines`);
    console.log('\n✅ Setup complete!');
    console.log(`   - Created ${Object.keys(createdItems).length} items`);
    console.log(`   - Created 1 BOM (Rose bath bar recipe)`);
    console.log('\nYou can now use this BOM in the Manufacturing section!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
