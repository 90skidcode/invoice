import { chromium } from 'playwright';

const itemsToCreate = [
  { sku: 'ROSE-BAR-1500', name: 'Rose bath bar', isFinishedGood: true },
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
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('Opening Counter app...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Check if we need to login (if there's a login button)
    const loginButton = await page.locator('button:has-text("Login")').isVisible().catch(() => false);
    if (loginButton) {
      console.log('Login button found, attempting login...');
      // For now, just navigate to items if already logged in
    }

    // Check if we're on the dashboard, wait a moment for page to load
    await page.waitForTimeout(2000);

    // Navigate to Items
    console.log('Navigating to Items...');
    await page.click('a:has-text("Items"), button:has-text("Items")').catch(async () => {
      // Try sidebar navigation
      const itemsLink = await page.locator('a[href*="/items"]').first();
      if (await itemsLink.isVisible()) {
        await itemsLink.click();
      }
    });

    await page.waitForTimeout(2000);

    console.log('Creating items...');
    let created = 0;

    for (const item of itemsToCreate) {
      try {
        // Look for "Add Item" or "Create" button
        const createButton = await page.locator('button:has-text("Add Item"), button:has-text("New Item"), button:has-text("Create")').first();
        if (await createButton.isVisible()) {
          await createButton.click();
          await page.waitForTimeout(1000);
        }

        // Fill in SKU
        const skuInput = await page.locator('input[placeholder*="SKU"], input[name*="sku"]').first();
        if (await skuInput.isVisible()) {
          await skuInput.fill(item.sku);
        }

        // Fill in Name
        const nameInput = await page.locator('input[placeholder*="Name"], input[name*="name"]').first();
        if (await nameInput.isVisible()) {
          await nameInput.fill(item.name);
        }

        // If finished good, mark it
        if (item.isFinishedGood) {
          const checkboxes = await page.locator('input[type="checkbox"]').all();
          for (const checkbox of checkboxes) {
            const label = await checkbox.locator('..').textContent();
            if (label?.toLowerCase().includes('finished')) {
              await checkbox.check();
              break;
            }
          }
        }

        // Save
        const saveButton = await page.locator('button:has-text("Save"), button:has-text("Create")').last();
        if (await saveButton.isVisible()) {
          await saveButton.click();
          await page.waitForTimeout(1500);
          created++;
          console.log(`✓ Created: ${item.sku}`);
        }
      } catch (error) {
        console.log(`⚠ Error creating ${item.sku}: ${error}`);
      }
    }

    console.log(`\nSuccessfully created ${created} items`);
    console.log('Close the browser when done, or press Ctrl+C');

    // Keep browser open for manual verification
    await page.waitForTimeout(60000);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
