/** Controlled development fixture. Uses the approved bootstrap identity and
 * existing invitation/activation/onboarding/catalog APIs. Never prints secrets.
 * The invitation service is used only to keep the test token in-process; no
 * email is sent to the synthetic .invalid address. */
import assert from "node:assert/strict";
import { config } from "dotenv";
import { createDb } from "../src/db";
import { eq } from "drizzle-orm";
import { categories, subcategories } from "../src/db/schema/catalog";
import { reissueInvitation } from "../src/services/admin/invitation.service";

config({ path: ".env", quiet: true });
config({ path: ".env.phase11b2.local", quiet: true });

const base = process.env.PHASE11B2_API_URL ?? "http://127.0.0.1:8787";
const origin = process.env.PHASE11B2_FRONTEND_ORIGIN ?? "http://127.0.0.1:3000";
const suffix = process.env.PHASE11B2_FIXTURE_SUFFIX;
const superEmail = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
const superPassword = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
const adminEmail = process.env.PHASE11B2_ADMIN_EMAIL;
const adminPassword = process.env.PHASE11B2_ADMIN_PASSWORD;
if (!process.env.DATABASE_URL || !suffix || !superEmail || !superPassword || !adminEmail || !adminPassword) throw new Error("Private fixture configuration is incomplete");
if (!superEmail.endsWith("@example.invalid") || !adminEmail.endsWith("@example.invalid") || !/^[a-f0-9]{12}$/.test(suffix)) throw new Error("Only synthetic Phase 11b-2 identities are allowed");
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Fixture API must be a local Worker");

async function api<T>(path: string, init: RequestInit = {}, cookie?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Origin", origin);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  if (!response.ok) throw new Error(`Fixture API ${path.split("?")[0]} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function signIn(email: string, password: string) {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password }), redirect: "manual",
  });
  if (!response.ok) throw new Error(`Fixture sign-in returned HTTP ${response.status}`);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Fixture sign-in returned no session cookie");
  return cookie;
}

async function main() {
  const superCookie = await signIn(superEmail!, superPassword!);
  const superActor = await api<{ userId: string; roles: string[] }>("/api/me", {}, superCookie);
  assert.ok(superActor.roles.includes("SUPER_ADMIN"));
  console.log("Super Admin credential login and role: PASS");

  const categorySlug = `phase11b2-accessories-${suffix}`;
  const productSlug = `phase11b2-cotton-tote-${suffix}`;
  const { db, client } = createDb(process.env.DATABASE_URL!);
  let category: { id: string };
  let subcategory: { id: string };
  let invitation: Awaited<ReturnType<typeof reissueInvitation>>;
  try {
    [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug)).limit(1);
    assert.ok(category, "Previously created fixture category must exist");
    [subcategory] = await db.select({ id: subcategories.id }).from(subcategories).where(eq(subcategories.categoryId, category.id)).limit(1);
    assert.ok(subcategory, "Previously created fixture subcategory must exist");
    invitation = await reissueInvitation(db, { email: adminEmail!, invitedByUserId: superActor.userId });
  }
  finally { await client.end({ timeout: 1 }); }
  console.log("Existing published category and subcategory reused; pending invitation reissued: PASS");
  const activated = await api<{ adminId: string }>("/api/admin/activate", { method: "POST", body: JSON.stringify({ token: invitation.rawToken, password: adminPassword }) });
  const adminCookie = await signIn(adminEmail!, adminPassword!);
  const adminActor = await api<{ roles: string[]; adminApproved: boolean }>("/api/me", {}, adminCookie);
  assert.ok(adminActor.roles.includes("ADMIN"));
  assert.equal(adminActor.adminApproved, false);
  console.log("Invitation, one-time activation, pending Admin login: PASS");

  await api("/api/admin/onboarding/kyc", { method: "PUT", body: JSON.stringify({ legalName: "TEST Ownline Verification Seller", businessType: "DEVELOPMENT_TEST", contactPhone: "9999999999" }) }, adminCookie);
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.set("documentType", "TEST_ONLY_NOT_REAL_KYC");
  form.set("file", new Blob([image], { type: "image/png" }), "TEST-ONLY-NOT-REAL-KYC.png");
  await api("/api/admin/onboarding/kyc/documents", { method: "POST", body: form }, adminCookie);
  const address = { businessName: "TEST Ownline Seller", contactName: "Test Seller", phone: "9999999999", line1: "Test Only Verification Lane", city: "Delhi", state: "Delhi", postalCode: "110001", country: "IN" };
  await api("/api/admin/onboarding/addresses/SHIPPING_ORIGIN", { method: "PUT", body: JSON.stringify(address) }, adminCookie);
  await api("/api/admin/onboarding/addresses/RETURN", { method: "PUT", body: JSON.stringify({ ...address, line1: "Test Only Return Lane" }) }, adminCookie);
  await api(`/api/admin/onboarding/categories/${category.id}`, { method: "POST" }, adminCookie);
  await api("/api/admin/onboarding/submit", { method: "POST" }, adminCookie);
  const review = await api<{ profile: { status: string }; documents: unknown[] }>(`/api/admin/review/${activated.adminId}`, {}, superCookie);
  assert.equal(review.profile.status, "PENDING_SUPER_ADMIN_APPROVAL");
  assert.ok(review.documents.length > 0);
  await api(`/api/admin/review/${activated.adminId}/decision`, { method: "POST", body: JSON.stringify({ decision: "APPROVED", notes: "Controlled development fixture only; synthetic KYC evidence is not a real identity document." }) }, superCookie);
  const approved = await api<{ adminApproved: boolean }>("/api/me", {}, adminCookie);
  assert.equal(approved.adminApproved, true);
  console.log("Test-only KYC, both addresses, category request, review, approval: PASS");

  const product = await api<{ id: string }>("/api/admin/products", { method: "POST", body: JSON.stringify({ categoryId: category.id, subcategoryId: subcategory.id, name: "TEST Ownline Everyday Cotton Tote", slug: productSlug, description: "Controlled development item for public catalog and static page verification. Not offered for sale.", sku: `TEST-TOTE-${suffix}`, price: "349.00", weightKg: "0.250", lengthCm: "36.00", breadthCm: "32.00", heightCm: "4.00", attributes: {}, returnEnabled: false }) }, adminCookie);
  await api(`/api/admin/products/${product.id}/inventory`, { method: "PUT", body: JSON.stringify({ quantity: 12 }) }, adminCookie);
  await api(`/api/admin/catalog/products/${product.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "PUBLISHED" }) }, superCookie);
  await api(`/api/admin/catalog/products/${product.id}/featured`, { method: "PATCH", body: JSON.stringify({ featured: true }) }, superCookie);
  console.log("Test product creation, inventory, publication, featured curation: PASS");
  console.log(`Fixture retained for static-route verification: category=${categorySlug} product=${productSlug}`);
}

main().catch((error: unknown) => {
  console.error("Phase 11b-2 fixture stopped", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" });
  process.exitCode = 1;
});
