import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { config, parse } from "dotenv";
import { assertLocalOrOptedIn } from "./local-db-guard";
import { eq, inArray } from "drizzle-orm";
import { app } from "../src";
import { createDb } from "../src/db";
import { adminAuditEvents, adminCategoryAssignments } from "../src/db/schema/admin";
import { categories, productAdmins, products, subcategories } from "../src/db/schema/catalog";
import { accounts, sessions, users, verifications } from "../src/db/schema/auth";
import { admins, roles, userRoles } from "../src/db/schema/rbac";
import type { AuthBindings } from "../src/lib/auth/auth";
import { provisionCredentialUser } from "../src/services/admin/provision.service";

config({ path: ".env", quiet: true });
assertLocalOrOptedIn("verify-auth-e2e.ts");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const vars = parse(readFileSync(".dev.vars"));
const target = process.env.VERIFY_API_URL;
if (target && new URL(target).protocol !== "https:") throw new Error("Remote verification requires HTTPS");
const origin = process.env.VERIFY_FRONTEND_ORIGIN ?? vars.FRONTEND_ORIGIN;
const required = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "FRONTEND_ORIGIN", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const;
if (required.some((key) => !vars[key])) throw new Error("Local Better Auth configuration is incomplete");

const env = { ...vars, HYPERDRIVE: { connectionString: process.env.DATABASE_URL } } as unknown as AuthBindings;
const { db, client } = createDb(process.env.DATABASE_URL);
const fixture = randomUUID();
const ownerEmail = `auth-owner-${fixture}@example.invalid`;
const adminEmail = `auth-admin-${fixture}@example.invalid`;
const ownerPassword = `Owner!${fixture}aA1`;
const adminPassword = `Admin!${fixture}aA1`;
const fixtureUserIds: string[] = [];
const fixtureCategoryIds: string[] = [];
const fixtureEmails = [ownerEmail, adminEmail, `auth-admin-b-${fixture}@example.invalid`];

function cookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!value) throw new Error("Authentication response did not set a session cookie");
  return value;
}

async function request(path: string, init: RequestInit = {}) {
  const options = { ...init, ...(init.method === "POST" && init.body === undefined ? { body: "{}" } : {}), headers: { Origin: origin, ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}), ...init.headers } };
  return target ? fetch(new URL(path, target), { ...options, redirect: "manual", signal: AbortSignal.timeout(30000) }) : app.request(new URL(path, vars.BETTER_AUTH_URL).toString(), options, env);
}

async function signIn(email: string, password: string) {
  const response = await request("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  return cookie(response);
}

async function cleanup() {
  if (fixtureCategoryIds.length) {
    const productRows = await db.select({ id: products.id }).from(products).where(inArray(products.categoryId, fixtureCategoryIds));
    if (productRows.length) {
      await db.delete(productAdmins).where(inArray(productAdmins.productId, productRows.map((row) => row.id)));
      await db.delete(products).where(inArray(products.id, productRows.map((row) => row.id)));
    }
    await db.delete(subcategories).where(inArray(subcategories.categoryId, fixtureCategoryIds));
    await db.delete(adminCategoryAssignments).where(inArray(adminCategoryAssignments.categoryId, fixtureCategoryIds));
    await db.delete(categories).where(inArray(categories.id, fixtureCategoryIds));
  }
  // Also recover provisioned fixtures if the HTTP response was lost after commit.
  const recovered = await db.select({ id: users.id }).from(users).where(inArray(users.email, fixtureEmails));
  for (const user of recovered) if (!fixtureUserIds.includes(user.id)) fixtureUserIds.push(user.id);
  if (!fixtureUserIds.length) return;
  const adminRows = await db.select({ id: admins.id }).from(admins).where(inArray(admins.userId, fixtureUserIds));
  if (adminRows.length) await db.delete(adminAuditEvents).where(inArray(adminAuditEvents.adminId, adminRows.map((row) => row.id)));
  await db.delete(admins).where(inArray(admins.userId, fixtureUserIds));
  await db.delete(sessions).where(inArray(sessions.userId, fixtureUserIds));
  await db.delete(accounts).where(inArray(accounts.userId, fixtureUserIds));
  await db.delete(userRoles).where(inArray(userRoles.userId, fixtureUserIds));
  await db.delete(verifications).where(inArray(verifications.identifier, fixtureEmails));
  await db.delete(users).where(inArray(users.id, fixtureUserIds));
}

async function main() {
  assert.equal((await request("/health")).status, 200);
  assert.equal((await request("/api/me")).status, 401);
  for (const path of ["/api/admin/summary", "/api/admin/products", "/api/super-admin/summary", "/api/super-admin/admins"]) {
    assert.equal((await request(path)).status, 401, path);
  }
  const [ownerRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, "SUPER_ADMIN")).limit(1);
  if (!ownerRole) throw new Error("SUPER_ADMIN role is unavailable");
  const [existingOwner] = await db.select({ id: users.id }).from(userRoles).innerJoin(users, eq(userRoles.userId, users.id)).where(eq(userRoles.roleId, ownerRole.id)).limit(1);
  if (existingOwner) throw new Error("A real Super Admin exists; use its credentials for verification instead of a fixture");

  const owner = await provisionCredentialUser(db, { email: ownerEmail, name: "Auth Fixture Owner", password: ownerPassword }, "SUPER_ADMIN");
  fixtureUserIds.push(owner.userId);
  const wrongPassword = await request("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ownerEmail, password: "incorrect-password" }) });
  assert.equal(wrongPassword.status, 401);
  const ownerCookie = await signIn(ownerEmail, ownerPassword);
  const ownerMe = await request("/api/me", { headers: { Cookie: ownerCookie } });
  assert.equal(ownerMe.status, 200);
  assert.ok(((await ownerMe.json()) as { roles: string[] }).roles.includes("SUPER_ADMIN"));
  assert.equal((await request("/api/super-admin/reviews/pending", { headers: { Cookie: ownerCookie } })).status, 200);
  assert.equal((await request("/api/admin/summary", { headers: { Cookie: ownerCookie } })).status, 403);
  assert.equal((await request("/api/admin/products", { headers: { Cookie: ownerCookie } })).status, 403);
  const superSummaryResponse = await request("/api/super-admin/summary", { headers: { Cookie: ownerCookie } });
  assert.equal(superSummaryResponse.status, 200);
  assert.ok((await superSummaryResponse.json() as { admins: { total: number } }).admins.total >= 0);
  assert.equal((await request("/api/super-admin/admins?status=INVALID", { headers: { Cookie: ownerCookie } })).status, 422);

  // Credential fixtures exercise RBAC; the public Admin route now requires an invitation.
  const rejectInitialPassword = await request("/api/admin/review/provision", { method: "POST", headers: { Cookie: ownerCookie, "Content-Type": "application/json" }, body: JSON.stringify({ email: adminEmail, name: "Auth Fixture Admin", password: adminPassword }) });
  assert.equal(rejectInitialPassword.status, 422);
  const provisioned = await provisionCredentialUser(db, { email: adminEmail, name: "Auth Fixture Admin", password: adminPassword }, "ADMIN");
  fixtureUserIds.push(provisioned.userId);

  const adminCookie = await signIn(adminEmail, adminPassword);
  const adminMe = await request("/api/me", { headers: { Cookie: adminCookie } });
  assert.equal(adminMe.status, 200);
  const adminActor = await adminMe.json() as { roles: string[]; adminApproved: boolean };
  assert.ok(adminActor.roles.includes("ADMIN"));
  assert.equal(adminActor.adminApproved, false);
  assert.equal((await request("/api/admin/summary", { headers: { Cookie: adminCookie } })).status, 403);
  assert.equal((await request("/api/admin/products", { headers: { Cookie: adminCookie } })).status, 403);
  assert.equal((await request("/api/super-admin/summary", { headers: { Cookie: adminCookie } })).status, 403);
  assert.equal((await request("/api/super-admin/admins", { headers: { Cookie: adminCookie } })).status, 403);
  assert.equal((await request("/api/admin/onboarding", { headers: { Cookie: adminCookie } })).status, 200);
  assert.equal((await request("/api/admin/catalog/categories", { method: "POST", headers: { Cookie: adminCookie, "Content-Type": "application/json" }, body: "{}" })).status, 403);
  assert.equal((await request("/api/admin/products", { method: "POST", headers: { Cookie: adminCookie, "Content-Type": "application/json" }, body: "{}" })).status, 403);
  for (const [method, path] of [
    ["GET", "/api/admin/orders"],
    ["GET", "/api/admin/finance"],
    ["POST", "/api/admin/payouts"],
    ["POST", "/api/super-admin/settlements"],
    ["POST", `/api/super-admin/reviews/${randomUUID()}/moderate`],
    ["POST", `/api/super-admin/payouts/${randomUUID()}/paid`],
    ["POST", "/api/admin/review/provision"],
  ]) assert.equal((await request(path, { method, headers: { Cookie: adminCookie, "Content-Type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) })).status, 403, `${method} ${path}`);

  const second = await provisionCredentialUser(db, { email: fixtureEmails[2], name: "Auth Fixture Admin B", password: adminPassword }, "ADMIN");
  fixtureUserIds.push(second.userId);
  const secondCookie = await signIn(fixtureEmails[2], adminPassword);
  const sellerRows = await db.select({ id: admins.id, userId: admins.userId }).from(admins).where(inArray(admins.userId, [provisioned.userId, second.userId]));
  const sellerA = sellerRows.find((row) => row.userId === provisioned.userId)!;
  // Approval is fixture setup here; the full KYC transition is verified by verify:workflows.
  await db.update(admins).set({ status: "ACTIVE" }).where(inArray(admins.id, sellerRows.map((row) => row.id)));
  const adminsResponse = await request(`/api/super-admin/admins?q=${encodeURIComponent(adminEmail)}`, { headers: { Cookie: ownerCookie } });
  assert.equal(adminsResponse.status, 200);
  const adminList = await adminsResponse.json() as { admins: { userEmail: string; userId: string }[] };
  assert.deepEqual(adminList.admins.map((row) => row.userEmail), [adminEmail]);
  assert.ok(!JSON.stringify(adminList).includes("privateObjectKey"));
  const scopes = await db.insert(categories).values([
    { name: "Fixture Dress", slug: `auth-dress-${fixture}`, status: "PUBLISHED" },
    { name: "Fixture Gadgets", slug: `auth-gadgets-${fixture}`, status: "PUBLISHED" },
  ]).returning();
  fixtureCategoryIds.push(...scopes.map((row) => row.id));
  const children = await db.insert(subcategories).values(scopes.map((scope) => ({ categoryId: scope.id, name: "Fixture Child", slug: "fixture", status: "PUBLISHED" }))).returning();
  await db.insert(adminCategoryAssignments).values([
    { adminId: sellerA.id, categoryId: scopes[0].id, status: "ACTIVE", assignedByUserId: owner.userId },
    { adminId: second.adminId!, categoryId: scopes[1].id, status: "ACTIVE", assignedByUserId: owner.userId },
  ]);
  const productInput = (index: number) => ({ categoryId: scopes[index].id, subcategoryId: children.find((child) => child.categoryId === scopes[index].id)!.id, name: "Auth Scope Fixture", slug: `auth-product-${fixture}-${index}`, price: "100.00", attributes: {} });
  const mutate = (session: string, method: string, path: string, value: unknown) => request(path, { method, headers: { Cookie: session, "Content-Type": "application/json" }, body: JSON.stringify(value) });
  assert.equal((await mutate(adminCookie, "POST", "/api/admin/products", productInput(1))).status, 403);
  assert.equal((await mutate(secondCookie, "POST", "/api/admin/products", productInput(0))).status, 403);
  assert.equal((await mutate(adminCookie, "POST", "/api/admin/products", { ...productInput(0), subcategoryId: productInput(1).subcategoryId })).status, 422);
  const created = await mutate(adminCookie, "POST", "/api/admin/products", productInput(0));
  assert.equal(created.status, 200);
  const product = await created.json() as { id: string; status: string };
  assert.equal(product.status, "DRAFT");
  assert.equal((product as { featured?: boolean }).featured, false);
  const ownProductsResponse = await request("/api/admin/products", { headers: { Cookie: adminCookie } });
  assert.equal(ownProductsResponse.status, 200);
  const ownProducts = await ownProductsResponse.json() as { products: { id: string }[] };
  assert.deepEqual(ownProducts.products.map((row) => row.id), [product.id]);
  const otherProducts = await request("/api/admin/products", { headers: { Cookie: secondCookie } });
  assert.equal(otherProducts.status, 200);
  assert.deepEqual((await otherProducts.json() as { products: unknown[] }).products, []);
  const adminSummary = await request("/api/admin/summary", { headers: { Cookie: adminCookie } });
  assert.equal(adminSummary.status, 200);
  assert.equal((await adminSummary.json() as { products: { total: number } }).products.total, 1);
  const [featuredPublished, newerPublished, featuredDraft] = await db.insert(products).values([
    { categoryId: scopes[0].id, subcategoryId: children[0].id, createdByAdminId: sellerA.id, name: "Featured", slug: `auth-featured-${fixture}`, price: "100.00", status: "PUBLISHED", featured: true, createdAt: new Date("2026-01-01T00:00:00Z") },
    { categoryId: scopes[0].id, subcategoryId: children[0].id, createdByAdminId: sellerA.id, name: "New Arrival", slug: `auth-new-${fixture}`, price: "100.00", status: "PUBLISHED", createdAt: new Date("2026-02-01T00:00:00Z") },
    { categoryId: scopes[0].id, subcategoryId: children[0].id, createdByAdminId: sellerA.id, name: "Hidden Draft", slug: `auth-draft-${fixture}`, price: "100.00", status: "DRAFT", featured: true },
  ]).returning({ id: products.id });
  const publicFeatured = await request(`/api/products?category=${encodeURIComponent(scopes[0].slug)}&featured=true`);
  assert.equal(publicFeatured.status, 200);
  assert.deepEqual((await publicFeatured.json() as { products: { id: string }[] }).products.map((row) => row.id), [featuredPublished.id]);
  const publicNew = await request(`/api/products?category=${encodeURIComponent(scopes[0].slug)}`);
  assert.equal(publicNew.status, 200);
  assert.deepEqual((await publicNew.json() as { products: { id: string }[] }).products.map((row) => row.id), [newerPublished.id, featuredPublished.id]);
  assert.notEqual(featuredDraft.id, featuredPublished.id);
  for (const input of [{ price: "1.00" }, { name: "Hijacked" }, { categoryId: scopes[0].id }, { attributes: { bogus: 1 } }, { returnEnabled: true }]) {
    const crossAdminPatch = await mutate(secondCookie, "PATCH", `/api/admin/products/${product.id}`, input);
    assert.equal(crossAdminPatch.status, 404);
    assert.deepEqual(await crossAdminPatch.json(), { error: "Product unavailable" });
  }
  const ownerPatch = await mutate(adminCookie, "PATCH", `/api/admin/products/${product.id}`, { name: "Owner HTTP update" });
  assert.equal(ownerPatch.status, 200);
  assert.equal((await ownerPatch.json() as { name: string }).name, "Owner HTTP update");
  assert.equal((await mutate(adminCookie, "PATCH", `/api/admin/products/${product.id}`, { featured: true })).status, 422);
  assert.equal((await mutate(adminCookie, "PATCH", `/api/admin/products/${product.id}`, { status: "PUBLISHED" })).status, 422);
  await db.update(adminCategoryAssignments).set({ status: "REVOKED" }).where(eq(adminCategoryAssignments.adminId, sellerA.id));
  const revokedProducts = await request("/api/admin/products", { headers: { Cookie: adminCookie } });
  assert.equal(revokedProducts.status, 200);
  assert.deepEqual((await revokedProducts.json() as { products: unknown[] }).products, []);
  const revokedSummary = await request("/api/admin/summary", { headers: { Cookie: adminCookie } });
  assert.equal(revokedSummary.status, 200);
  assert.equal((await revokedSummary.json() as { products: { total: number } }).products.total, 0);
  assert.equal((await mutate(adminCookie, "PATCH", `/api/admin/products/${product.id}`, { price: "1.00" })).status, 403);
  assert.equal((await mutate(adminCookie, "PUT", `/api/admin/products/${product.id}/inventory`, { quantity: 5, expectedVersion: 0 })).status, 403);
  assert.equal((await request("/api/auth/sign-out", { method: "POST", headers: { Cookie: secondCookie } })).status, 200);
  assert.equal((await request("/api/me", { headers: { Cookie: secondCookie } })).status, 401);

  const adminSignOut = await request("/api/auth/sign-out", { method: "POST", headers: { Cookie: adminCookie } });
  assert.equal(adminSignOut.status, 200);
  assert.equal((await request("/api/me", { headers: { Cookie: adminCookie } })).status, 401);
  const ownerSignOut = await request("/api/auth/sign-out", { method: "POST", headers: { Cookie: ownerCookie } });
  assert.equal(ownerSignOut.status, 200);
  assert.equal((await request("/api/me", { headers: { Cookie: ownerCookie } })).status, 401);
}

main()
  .then(() => console.log(`Better Auth E2E passed (${target ? "deployed HTTPS Worker" : "in-process API + configured local PostgreSQL"}): real fixture credential sessions, invalid-password rejection, role resolution, dashboard RBAC and aggregate/list routes, public Featured/New Arrivals filters, cross-Admin PATCH returned 404 { error: "Product unavailable" } for all payload variants, owner PATCH succeeded, revoked-category isolation, logout. Google OAuth and permanent operator credentials are NOT VERIFIED.`))
  .catch((error: unknown) => { console.error("Better Auth E2E failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error && error.name === "AssertionError" ? error.message.slice(0, 200) : undefined, code: (error as { code?: string } | null)?.code, at: error instanceof Error ? error.stack?.split("\n").find((line) => line.includes("verify-auth-e2e.ts"))?.trim() : undefined }); process.exitCode = 1; })
  .finally(async () => {
    try {
      await cleanup();
      const leftovers = fixtureUserIds.length ? await db.select({ id: users.id }).from(users).where(inArray(users.id, fixtureUserIds)) : [];
      assert.equal(leftovers.length, 0);
      console.log("Authentication fixture cleanup verified.");
    } finally { await client.end({ timeout: 1 }); }
  });
