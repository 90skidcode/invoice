import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Config } from 'drizzle-kit';

// Load root .env.local so DATABASE_URL is available to drizzle-kit (Node 21+).
const envPath = resolve(process.cwd(), '../../.env.local');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default {
  // Point at compiled output: our NodeNext source uses `.js` import specifiers
  // that drizzle-kit's bundler can't resolve against `.ts` files. Run `pnpm build` first.
  schema: './dist/schema/index.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/counter_dev',
    // Hosted Postgres (Supabase) requires TLS; local dev does not.
    ssl: /@(localhost|127\.0\.0\.1)/.test(process.env['DATABASE_URL'] ?? '') ? false : 'require',
  },
} satisfies Config;
