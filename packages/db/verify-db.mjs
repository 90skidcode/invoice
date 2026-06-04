// Quick DB introspection — confirms migrations landed. Run with:
//   node --env-file-if-exists=.env.local scripts/verify-db.mjs
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, { ssl: 'require', max: 1 });

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;

  const triggers = await sql`
    SELECT trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name`;

  console.info(`\nTables (${tables.length}):`);
  console.info('  ' + tables.map((t) => t.table_name).join(', '));

  const uniqueTriggers = [...new Set(triggers.map((t) => t.trigger_name))];
  console.info(`\nTriggers (${uniqueTriggers.length}):`);
  for (const t of uniqueTriggers) {
    const tbl = triggers.find((x) => x.trigger_name === t)?.event_object_table;
    console.info(`  ${t} on ${tbl}`);
  }
} finally {
  await sql.end();
}
