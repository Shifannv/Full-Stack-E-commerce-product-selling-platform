import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env", quiet: true });
config({ path: ".env.phase11b2.local", quiet: true });

const {
  DATABASE_URL: url,
  BOOTSTRAP_SUPER_ADMIN_EMAIL: ownerEmail,
  PHASE11B2_ADMIN_EMAIL: adminEmail,
  PHASE11B2_FIXTURE_SUFFIX: suffix,
} = process.env;
if (!url || !ownerEmail || !adminEmail || !suffix)
  throw new Error("Private fixture configuration is incomplete");

async function main() {
  const sql = postgres(url!, { max: 1 });
  try {
    const identities = await sql`
    select u.email, u.status as user_status, r.name as role, a.id as admin_id,
      a.status as admin_status, k.status as kyc_status,
      (select count(*)::integer from admin_kyc_documents d where d.submission_id = k.id) as document_count,
      (select count(*)::integer from admin_addresses x where x.admin_id = a.id and x.is_active) as address_count,
      (select count(*)::integer from admin_category_assignments x where x.admin_id = a.id and x.status = 'ACTIVE') as active_categories,
      (select count(*)::integer from verifications v where v.value::jsonb ->> 'email' = u.email and v.identifier like 'invite:%') as invitations
    from users u join user_roles ur on ur.user_id = u.id join roles r on r.id = ur.role_id
    left join admins a on a.user_id = u.id left join admin_kyc_submissions k on k.admin_id = a.id
    where u.email in (${ownerEmail!}, ${adminEmail!}) order by r.name`;
    const catalog = await sql`
    select c.id, c.slug, c.status,
      (select count(*)::integer from subcategories s where s.category_id = c.id) as subcategories,
      (select count(*)::integer from products p where p.category_id = c.id) as products
    from categories c where c.slug = ${`phase11b2-accessories-${suffix}`}`;
    console.log(
      JSON.stringify({
        identities: identities.map(({ email, ...record }) => ({
          identity: email === ownerEmail ? "owner" : "admin",
          ...record,
        })),
        catalog,
      }),
    );
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error: unknown) => {
  console.error("Fixture inspection failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: (error as { code?: string } | null)?.code,
  });
  process.exitCode = 1;
});
