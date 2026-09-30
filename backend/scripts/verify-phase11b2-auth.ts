import assert from "node:assert/strict";
import { config } from "dotenv";

config({ path: ".env.phase11b2.local", quiet: true });
const { BOOTSTRAP_SUPER_ADMIN_EMAIL: ownerEmail, BOOTSTRAP_SUPER_ADMIN_PASSWORD: ownerPassword, PHASE11B2_ADMIN_EMAIL: adminEmail, PHASE11B2_ADMIN_PASSWORD: adminPassword } = process.env;
if (!ownerEmail || !ownerPassword || !adminEmail || !adminPassword) throw new Error("Private fixture credentials are incomplete");
const base = process.env.PHASE11B2_API_URL ?? "http://127.0.0.1:8787";
const origin = process.env.PHASE11B2_FRONTEND_ORIGIN ?? "http://127.0.0.1:3000";

async function request(path: string, init: RequestInit = {}, cookie?: string): Promise<Response> {
  return fetch(`${base}${path}`, { ...init, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await request("/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200);
  const setCookies = response.headers.getSetCookie();
  assert.ok(setCookies.some((part) => /httponly/i.test(part) && /samesite=lax/i.test(part)), "Session cookie must remain HttpOnly and SameSite=Lax");
  const cookie = setCookies.map((part) => part.split(";")[0]).join("; ");
  assert.ok(cookie);
  return cookie;
}

async function main() {
  for (const path of ["/api/me", "/api/customer/wishlist", "/api/customer/cart", "/api/customer/addresses", "/api/customer/checkout/quote?addressId=missing", "/api/orders"]) {
    assert.equal((await request(path)).status, 401, `${path} must require a session`);
  }
  assert.equal((await request("/api/admin/products")).status, 401);
  assert.equal((await request("/api/super-admin/summary")).status, 401);
  const uploadPath = "/api/admin/products/7feac135-cab3-4ad8-b01e-331550f2eb37/images/upload";
  assert.equal((await request(uploadPath, { method: "POST" })).status, 401);
  const adminCookie = await signIn(adminEmail!, adminPassword!);
  const admin = await (await request("/api/me", {}, adminCookie)).json() as { roles: string[]; adminApproved: boolean };
  assert.ok(admin.roles.includes("ADMIN"));
  assert.equal(admin.adminApproved, true);
  assert.equal((await request("/api/admin/products", {}, adminCookie)).status, 200);
  assert.equal((await request("/api/super-admin/summary", {}, adminCookie)).status, 403);
  assert.equal((await request(uploadPath, { method: "POST" }, adminCookie)).status, 422);
  const ownerCookie = await signIn(ownerEmail!, ownerPassword!);
  const owner = await (await request("/api/me", {}, ownerCookie)).json() as { roles: string[] };
  assert.ok(owner.roles.includes("SUPER_ADMIN"));
  assert.equal((await request("/api/super-admin/summary", {}, ownerCookie)).status, 200);
  assert.equal((await request(uploadPath, { method: "POST" }, ownerCookie)).status, 403);
  assert.equal((await request("/api/admin/review/provision", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, ownerCookie)).status, 422);
  const logout = await request("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, adminCookie);
  assert.equal(logout.status, 200);
  assert.equal((await request("/api/admin/products", {}, adminCookie)).status, 401);
  console.log("Authenticated Admin and Super Admin access, cross-role denial, and logout: PASS");
}

main().catch((error: unknown) => {
  console.error("Fixture auth verification failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" });
  process.exitCode = 1;
});
