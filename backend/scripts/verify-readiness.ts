import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const client = postgres(process.env.DATABASE_URL, { max: 1 });
async function main() {
  try {
    const roleCounts =
      await client`select r.name, count(ur.user_id)::integer as users from roles r left join user_roles ur on ur.role_id = r.id group by r.name order by r.name`;
    const adminCounts =
      await client`select status, count(*)::integer as count from admins group by status order by status`;
    const [catalog] =
      await client`select (select count(*)::integer from categories) categories, (select count(*)::integer from products) products, (select count(*)::integer from product_variants) variants`;
    console.log(JSON.stringify({ roleCounts, adminCounts, catalog }));
  } finally {
    await client.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error("Readiness query failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: (error as { code?: string } | null)?.code,
  });
  process.exitCode = 1;
});
