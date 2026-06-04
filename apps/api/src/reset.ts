import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '../../.env.local');
if (existsSync(envPath)) process.loadEnvFile(envPath);

import { sql } from 'drizzle-orm';
import { createDbClient } from '@counter/db';
import { runSeed } from './seed.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set — check .env.local');
  process.exit(1);
}

/**
 * DEV ONLY. Wipes all data in the public schema and reseeds. Drizzle's migration
 * journal lives in the `drizzle` schema, so it is untouched (no re-migrate needed).
 * TRUNCATE does not fire the append-only row triggers, so it cleanly resets the ledger.
 */
async function reset() {
  const db = createDbClient(DATABASE_URL!);

  const tables = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const names = (tables as unknown as { tablename: string }[]).map((t) => t.tablename);
  if (names.length === 0) {
    console.error('No public tables found — run migrations first.');
    process.exit(1);
  }

  const quoted = names.map((n) => `"${n}"`).join(', ');
  await db.execute(sql.raw(`TRUNCATE ${quoted} RESTART IDENTITY CASCADE`));
  console.info(`✓ Truncated ${names.length} tables. Reseeding…`);

  await runSeed();
  process.exit(0);
}

reset().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
