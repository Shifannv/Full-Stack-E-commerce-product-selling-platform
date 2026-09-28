import postgres from "postgres";
import { config } from "dotenv";
config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const c = postgres(process.env.DATABASE_URL, { max: 1 });
async function main() {
  const [t] = await c`select count(*)::integer as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  const [m] = await c`select count(*)::integer as count from drizzle.__drizzle_migrations`;
  console.log("tables:", t.count, "migrations:", m.count);
  await c.end();
}
main().catch(console.error);
