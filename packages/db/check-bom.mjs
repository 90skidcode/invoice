import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
const sql = postgres(DATABASE_URL, { ssl: 'require' });

const boms = await sql`
  SELECT bh.id, bh.name, o.name as org_name, o.id as org_id
  FROM bom_headers bh
  JOIN organizations o ON bh.org_id = o.id
  WHERE bh.deleted_at IS NULL
`;

console.log('BOMs found:');
boms.forEach(b => console.log(`  - ${b.name} in org: ${b.org_name} (${b.org_id})`));

const allOrgs = await sql`SELECT id, name FROM organizations`;
console.log('\nAll organizations:');
allOrgs.forEach(o => console.log(`  - ${o.name} (${o.id})`));

await sql.end();
