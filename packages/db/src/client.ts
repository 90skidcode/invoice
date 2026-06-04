import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type DbClient = ReturnType<typeof createDbClient>;

export function createDbClient(connectionString: string) {
  // Hosted Postgres (Supabase, RDS, etc.) requires TLS; local dev does not.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const needsSsl =
    !isLocal && !/sslmode=disable/.test(connectionString);

  const queryClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(needsSsl ? { ssl: 'require' as const } : {}),
  });

  return drizzle(queryClient, {
    schema,
    logger: process.env['NODE_ENV'] === 'development',
  });
}

// Re-export schema for convenient imports
export { schema };
export type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
