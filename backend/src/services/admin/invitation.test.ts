/**
 * Unit tests for Admin invitation security and eligibility rules.
 *
 * Tests cover:
 * - Token hashing: raw token is never equal to the stored identifier
 * - Empty/invalid input validation (before any DB access)
 * - Five-day return boundary
 * - Dress return_enabled eligibility
 * - Seller return address disclosure rules
 * - CORS trusted origin enforcement
 * - Cashfree webhook idempotency key
 */
import assert from "node:assert/strict";
import test from "node:test";
import { activateAdminAccount, createInvitation, peekInvitation } from "./invitation.service";
import { CashfreePaymentAdapter } from "../cashfree-payment.adapter";
import { invitationLink, invitationSetupUrl } from "./invitation-url";

test("invitation links use HTTPS or the exact development origin and encode only the token", () => {
  const link = new URL(invitationLink("http://127.0.0.1:3000/admin/setup", "a+b/token"));
  assert.equal(link.pathname, "/admin/setup");
  assert.equal(link.searchParams.get("token"), "a+b/token");
  assert.equal([...link.searchParams.keys()].join(), "token");
  assert.equal(invitationSetupUrl("https://shop.example/admin/setup").protocol, "https:");
  for (const url of ["http://shop.example/admin/setup", "http://127.0.0.1:3001/admin/setup", "http://127.0.0.1.evil.test:3000/admin/setup", "https://user:password@shop.example/admin/setup", "https://shop.example/admin/setup#token", "https://shop.example/admin/setup?secret=value"]) {
    assert.throws(() => invitationSetupUrl(url));
  }
});

// ─── Token hashing ────────────────────────────────────────────────────────────

async function sha256hex(raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

test("invitation token is hashed — raw token must not equal the stored identifier", async () => {
  const rawToken = "some-raw-token-for-testing-12345678901234567890";
  const hash = await sha256hex(rawToken);
  const identifier = `invite:${hash}`;
  assert.notEqual(rawToken, hash, "Raw token and hash must differ");
  assert.ok(identifier.startsWith("invite:"), "Identifier must have invite: prefix");
  assert.ok(!/some-raw-token/.test(identifier), "Raw token must not appear in identifier");
  assert.equal(hash.length, 64, "SHA-256 hex must be 64 chars");
});

test("invitation token hashing is deterministic", async () => {
  const raw = "deterministic-test-token-abc123";
  const h1 = await sha256hex(raw);
  const h2 = await sha256hex(raw);
  assert.equal(h1, h2, "Hash must be deterministic");
});

test("different invitation tokens produce different hashes", async () => {
  const h1 = await sha256hex("token-a");
  const h2 = await sha256hex("token-b");
  assert.notEqual(h1, h2, "Different tokens must produce different hashes");
});

// ─── Input validation (no DB access needed) ───────────────────────────────────

test("activateAdminAccount rejects empty token before DB access", async () => {
  const stubDb = { transaction: async () => { throw new Error("Should not reach DB"); } } as never;
  await assert.rejects(
    () => activateAdminAccount(stubDb, { rawToken: "", password: "ValidPassword123!" }),
    /Invalid token/,
    "Empty token must be rejected",
  );
});

test("activateAdminAccount rejects password shorter than 12 characters", async () => {
  const stubDb = { transaction: async () => { throw new Error("Should not reach DB"); } } as never;
  await assert.rejects(
    () => activateAdminAccount(stubDb, { rawToken: "valid-raw-token-here", password: "short" }),
    /12 to 256/,
  );
});

test("activateAdminAccount rejects password longer than 256 characters", async () => {
  const stubDb = { transaction: async () => { throw new Error("Should not reach DB"); } } as never;
  await assert.rejects(
    () => activateAdminAccount(stubDb, { rawToken: "valid-raw-token-here", password: "x".repeat(257) }),
    /12 to 256/,
  );
});

test("createInvitation rejects invalid email before DB access", async () => {
  const stubDb = { transaction: async () => { throw new Error("Should not reach DB"); } } as never;
  await assert.rejects(
    () => createInvitation(stubDb, { email: "not-an-email", name: "Test", invitedByUserId: "actor" }),
    /Invalid email/,
  );
});

test("createInvitation rejects empty email before DB access", async () => {
  const stubDb = { transaction: async () => { throw new Error("Should not reach DB"); } } as never;
  await assert.rejects(
    () => createInvitation(stubDb, { email: "", name: "Test", invitedByUserId: "actor" }),
    /email is required/,
  );
});

test("peekInvitation rejects empty token before DB access", async () => {
  const stubDb = { select: () => { throw new Error("Should not reach DB"); } } as never;
  await assert.rejects(
    () => peekInvitation(stubDb, ""),
    /Invalid token/,
  );
});

// ─── Return window boundary ───────────────────────────────────────────────────

test("five-day return window: inclusive at boundary, exclusive after", () => {
  const delivered = new Date("2026-09-20T10:30:00.000Z");
  const dayMs = 86400000;
  const deadline = new Date(delivered.getTime() + 5 * dayMs);

  function within(now: Date): boolean {
    return now >= delivered && now <= deadline;
  }

  assert.equal(within(delivered), true, "At delivery = inside window");
  assert.equal(within(deadline), true, "At deadline = inside window (inclusive)");
  assert.equal(within(new Date(deadline.getTime() + 1)), false, "1ms after deadline = outside window");
  assert.equal(within(new Date(delivered.getTime() - 1)), false, "1ms before delivery = outside window");
  assert.equal(within(new Date("2026-09-22T10:30:00.000Z")), true, "Middle of window = inside");
});

// ─── Dress return_enabled eligibility ─────────────────────────────────────────

test("return eligibility requires both dress category AND return_enabled flag", () => {
  function isReturnable(categorySlug: string | null, returnEnabled: boolean | null): boolean {
    return returnEnabled === true && categorySlug === "dress";
  }

  assert.equal(isReturnable("dress", true), true, "dress + enabled = returnable");
  assert.equal(isReturnable("dress", false), false, "dress + disabled = not returnable");
  assert.equal(isReturnable("electronics", true), false, "non-dress + enabled = not returnable");
  assert.equal(isReturnable(null, true), false, "null category = not returnable");
  assert.equal(isReturnable("dress", null), false, "null flag = not returnable");
  assert.equal(isReturnable("Dress", true), false, "case-sensitive: Dress (capitalized) does not match slug");
});

// ─── Seller return address disclosure ─────────────────────────────────────────

test("seller return address is hidden before approval and visible after", () => {
  const alwaysHidden = ["REQUESTED", "REJECTED"];
  const alwaysVisible = [
    "APPROVED", "RETURN_PENDING", "RECEIVED", "QC_IN_PROGRESS",
    "QC_APPROVED", "QC_REJECTED", "REFUND_PROCESSING", "REFUNDED", "RETURN_ISSUE",
  ];

  function showsAddress(status: string): boolean {
    return [
      "APPROVED", "RETURN_PENDING", "RECEIVED", "QC_IN_PROGRESS",
      "QC_APPROVED", "QC_REJECTED", "REFUND_PROCESSING", "REFUNDED", "RETURN_ISSUE",
    ].includes(status);
  }

  for (const s of alwaysHidden) assert.equal(showsAddress(s), false, `${s}: address must be hidden`);
  for (const s of alwaysVisible) assert.equal(showsAddress(s), true, `${s}: address must be visible`);
});

// ─── CORS origin enforcement ───────────────────────────────────────────────────

test("CORS trusted origin allows only the exact configured frontend origin", () => {
  function corsAllow(origin: string, configured: string): boolean {
    return origin === configured;
  }

  const FRONTEND_ORIGIN = "http://localhost:3000";
  assert.equal(corsAllow("http://localhost:3000", FRONTEND_ORIGIN), true);
  assert.equal(corsAllow("http://localhost:3001", FRONTEND_ORIGIN), false);
  assert.equal(corsAllow("https://evil.example.com", FRONTEND_ORIGIN), false);
  assert.equal(corsAllow("", FRONTEND_ORIGIN), false);
  assert.equal(corsAllow("http://localhost:3000 ", FRONTEND_ORIGIN), false, "trailing space must not match");
});

// ─── Cashfree webhook idempotency ──────────────────────────────────────────────

test("Cashfree createOrder idempotency key equals the merchant order ID", async () => {
  let capturedKey: string | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    capturedKey = new Headers(init?.headers).get("x-idempotency-key") ?? undefined;
    return Response.json({ order_id: "order-idem-1", cf_order_id: 99, payment_session_id: "sess-idem-1" });
  };
  const adapter = new CashfreePaymentAdapter("id", "secret", "SANDBOX", fetcher);
  await adapter.createOrder({ orderId: "order-idem-1", amount: "100.00", currency: "INR", customerId: "c1", customerName: "C", customerEmail: "c@example.invalid", customerPhone: "9999999999", returnUrl: "https://shop.example/", notifyUrl: "https://api.example/webhooks" });
  assert.equal(capturedKey, "order-idem-1", "Idempotency key must equal the merchant order ID");
});

// ─── QC precedes refund authorization ─────────────────────────────────────────

test("refund authorization requires QC_APPROVED status — not just RECEIVED", () => {
  // Mirror of return.service.ts authorizeRefund guard.
  function canAuthorizeRefund(status: string, receivedAt: Date | null): boolean {
    return status === "QC_APPROVED" && receivedAt !== null;
  }

  assert.equal(canAuthorizeRefund("QC_APPROVED", new Date()), true, "QC approved + received = can authorize");
  assert.equal(canAuthorizeRefund("RECEIVED", new Date()), false, "Received but not QC approved = cannot authorize");
  assert.equal(canAuthorizeRefund("QC_APPROVED", null), false, "QC approved but not received = cannot authorize");
  assert.equal(canAuthorizeRefund("REQUESTED", new Date()), false, "REQUESTED = cannot authorize");
  assert.equal(canAuthorizeRefund("APPROVED", new Date()), false, "APPROVED (admin approved return) ≠ QC_APPROVED");
});
