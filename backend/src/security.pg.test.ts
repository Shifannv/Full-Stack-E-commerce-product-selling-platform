import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, createHmac } from "node:crypto";
import { config } from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "./db";
import { accounts, sessions, users, verifications } from "./db/schema/auth";
import { admins, roles, userRoles } from "./db/schema/rbac";
import {
  adminAuditEvents,
  adminKycDocuments,
  adminKycSubmissions,
} from "./db/schema/admin";
import { categories } from "./db/schema/catalog";
import { apiRateLimits } from "./db/schema/security";
import { createAuth, type AuthBindings } from "./lib/auth/auth";
import { readBoundedBody } from "./lib/security/body";
import {
  consumeMutationLimit,
  mutationRatePolicy,
} from "./middleware/rate-limit";
import { auditedMutation } from "./services/security-audit";
import { createCategory } from "./services/admin/catalog.service";
import {
  createInvitation,
  reissueInvitation,
} from "./services/admin/invitation.service";
import {
  verifyCashfreeWebhookSignature,
  CASHFREE_MAX_AGE_MS,
  CASHFREE_FUTURE_SKEW_MS,
} from "./services/cashfree-payment.adapter";
import worker from "./index";
import { shippingOperations } from "./db/schema/shipping";

config({ path: ".env.checkout-test.local", quiet: true });
const url = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!url) throw new Error("CHECKOUT_TEST_DATABASE_URL required");
const target = new URL(url);
if (
  target.hostname !== "127.0.0.1" ||
  target.port !== "5432" ||
  target.pathname !== "/ownline_checkout_test" ||
  decodeURIComponent(target.username) !== "postgres"
)
  throw new Error("Isolated PostgreSQL target required");
const env: AuthBindings & {
  CASHFREE_CLIENT_SECRET: string;
  SHIPROCKET_WEBHOOK_TOKEN: string;
} = {
  HYPERDRIVE: { connectionString: url },
  BETTER_AUTH_SECRET: "isolated-security-test-secret-2026-09-30",
  BETTER_AUTH_URL: "http://127.0.0.1:8787",
  FRONTEND_ORIGIN: "http://127.0.0.1:3000",
  GOOGLE_CLIENT_ID: "fixture",
  GOOGLE_CLIENT_SECRET: "fixture",
  CASHFREE_CLIENT_SECRET: "fixture-signature",
  SHIPROCKET_WEBHOOK_TOKEN: "fixture-token",
};
const secret = env.CASHFREE_CLIENT_SECRET;

test("shipping operator routes deny customer access and preserve origin protection", () =>
  fixture(async (c) => {
    const id = randomUUID();
    assert.equal(
      (
        await call("/api/super-admin/shipping/operations", {
          headers: c.headers,
        })
      ).status,
      403,
    );
    for (const suffix of [
      "reconcile",
      `operations/${id}/retry`,
      `operations/${id}/evidence`,
    ]) {
      assert.equal(
        (
          await call(`/api/super-admin/shipping/${suffix}`, {
            method: "POST",
            headers: c.headers,
            body: "{}",
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await call(`/api/super-admin/shipping/${suffix}`, {
            method: "POST",
            headers: { ...c.headers, origin: "https://evil.example" },
            body: "{}",
          })
        ).status,
        403,
      );
    }
  }));

test("shipping operator review retry is authenticated, bounded and audited", () =>
  fixture(async (c) => {
    const [op] = await c.db
      .insert(shippingOperations)
      .values({
        operationKey: `operator-test-${randomUUID()}`,
        providerKey: "shiprocket",
        providerReference: `missing-${randomUUID()}`,
        kind: "EVENT",
        state: "REVIEW",
        actor: "webhook",
        retryCount: 5,
        evidence: {},
      })
      .returning();
    try {
      assert.equal(
        (
          await call("/api/super-admin/shipping/operations", {
            headers: c.headers,
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await call("/api/super-admin/shipping/operations?after=invalid", {
            headers: c.headers,
          })
        ).status,
        422,
      );
      const response = await call(
        `/api/super-admin/shipping/operations/${op.id}/retry`,
        { method: "POST", headers: c.headers },
      );
      assert.equal(response.status, 200);
      const [saved] = await c.db
        .select()
        .from(shippingOperations)
        .where(eq(shippingOperations.id, op.id));
      assert.equal(saved.state, "UNKNOWN");
      assert.equal(saved.retryCount, 0);
      assert.equal(saved.actor, c.userId);
      const audit = await c.db
        .select()
        .from(adminAuditEvents)
        .where(eq(adminAuditEvents.actorUserId, c.userId));
      assert.ok(
        audit.some(
          (row) =>
            row.action === "shipping.reconciliation.retry" &&
            row.entityId === op.id,
        ),
      );
      assert.equal(
        (
          await call(`/api/super-admin/shipping/operations/${op.id}/retry`, {
            method: "POST",
            headers: c.headers,
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await call(`/api/super-admin/shipping/operations/${op.id}/evidence`, {
            method: "POST",
            headers: c.headers,
            body: "x".repeat(4097),
          })
        ).status,
        413,
      );
    } finally {
      await c.db
        .delete(shippingOperations)
        .where(eq(shippingOperations.id, op.id));
    }
  }, "SUPER_ADMIN"));
const sign = (body: string, timestamp: string) =>
  createHmac("sha256", secret)
    .update(timestamp + body)
    .digest("base64");
function call(path: string, init: RequestInit = {}, bindings = env) {
  return worker.fetch(new Request(env.BETTER_AUTH_URL + path, init), bindings);
}
async function fixture(
  run: (c: {
    db: ReturnType<typeof createDb>["db"];
    userId: string;
    cookie: string;
    headers: Record<string, string>;
  }) => Promise<void>,
  role = "CUSTOMER",
) {
  const { db, client } = createDb(url!);
  const userId = `security-${randomUUID()}`,
    password = "isolated security fixture password";
  try {
    await db.insert(users).values({
      id: userId,
      email: `${userId}@example.invalid`,
      name: "Security fixture",
      emailVerified: true,
    });
    await db.insert(accounts).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: await hashPassword(password),
    });
    await db.insert(roles).values({ name: role }).onConflictDoNothing();
    const [grant] = await db.select().from(roles).where(eq(roles.name, role));
    await db.insert(userRoles).values({ userId, roleId: grant.id });
    const auth = createAuth(env);
    let cookie: string;
    try {
      const response = await auth.auth.api.signInEmail({
        body: { email: `${userId}@example.invalid`, password },
        asResponse: true,
      });
      assert.equal(response.status, 200);
      cookie = response.headers.get("set-cookie")!.split(";")[0];
    } finally {
      await auth.client.end({ timeout: 1 });
    }
    await run({
      db,
      userId,
      cookie,
      headers: {
        cookie,
        origin: env.FRONTEND_ORIGIN,
        "content-type": "application/json",
      },
    });
  } finally {
    await db
      .delete(adminAuditEvents)
      .where(eq(adminAuditEvents.actorUserId, userId));
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(userRoles).where(eq(userRoles.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    // Only this fixture's hashed counters, never other test counters.
    const hash = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId)),
    ).toString("hex");
    await db.delete(apiRateLimits).where(
      inArray(
        apiRateLimits.key,
        ["commerce", "account", "invitation", "privileged"].map(
          (g) => `v1:${g}:${hash}`,
        ),
      ),
    );
    await client.end({ timeout: 1 });
  }
}

test("security same-origin and configured local-origin mutations reach the real checkout route", () =>
  fixture(async (c) => {
    for (const origin of [env.FRONTEND_ORIGIN, env.BETTER_AUTH_URL]) {
      const response = await call("/api/checkout", {
        method: "POST",
        headers: { ...c.headers, origin },
        body: "{}",
      });
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), {
        error: "IDEMPOTENCY_KEY_REQUIRED",
      });
    }
  }));
for (const origin of [
  undefined,
  "null",
  "https://evil.example",
  "http://127.0.0.1:3000.evil.example",
  "http://localhost:3000",
  "http://127.0.0.1:3000/path",
]) {
  test(`security rejects mutation Origin ${origin ?? "missing"} before authentication`, async () => {
    const headers: Record<string, string> = {};
    if (origin !== undefined) headers.origin = origin;
    const response = await call("/api/checkout", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "Untrusted mutation origin",
    });
  });
}
test("security trusted Referer fallback works; an invalid Origin cannot fall back", () =>
  fixture(async (c) => {
    const headers = {
      cookie: c.cookie,
      referer: env.FRONTEND_ORIGIN + "/cart",
    };
    assert.equal(
      (await call("/api/checkout", { method: "POST", headers, body: "{}" }))
        .status,
      422,
    );
    assert.equal(
      (
        await call("/api/checkout", {
          method: "POST",
          headers: { ...headers, origin: "null" },
          body: "{}",
        })
      ).status,
      403,
    );
  }));
test("security active account GET unaffected by origin; suspended and soft-deleted accounts denied", () =>
  fixture(async (c) => {
    assert.equal(
      (
        await call("/api/me", {
          headers: { cookie: c.cookie, origin: "https://evil.example" },
        })
      ).status,
      200,
    );
    await c.db
      .update(users)
      .set({ status: "SUSPENDED" })
      .where(eq(users.id, c.userId));
    assert.equal((await call("/api/me", { headers: c.headers })).status, 403);
    assert.equal(
      (
        await call(`/api/orders/${randomUUID()}/cancel`, {
          method: "POST",
          headers: c.headers,
        })
      ).status,
      403,
    );
    await c.db
      .update(users)
      .set({ status: "ACTIVE", deletedAt: new Date() })
      .where(eq(users.id, c.userId));
    assert.equal((await call("/api/me", { headers: c.headers })).status, 403);
    assert.equal(
      (
        await call("/api/checkout", {
          method: "POST",
          headers: c.headers,
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(`/api/orders/${randomUUID()}/cancel`, {
          method: "POST",
          headers: c.headers,
        })
      ).status,
      403,
    );
  }));
test("security rate limiter allows twenty checkout attempts then returns 429 once per request", () =>
  fixture(async (c) => {
    for (let i = 0; i < 20; i++)
      assert.equal(
        (
          await call("/api/checkout", {
            method: "POST",
            headers: c.headers,
            body: "{}",
          })
        ).status,
        422,
      );
    const response = await call("/api/checkout", {
      method: "POST",
      headers: c.headers,
      body: "{}",
    });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
    assert.equal((await call("/api/me", { headers: c.headers })).status, 200);
  }));
test("security independent PostgreSQL connections enforce one atomic rate window and database-clock reset", () =>
  fixture(async (c) => {
    const other = createDb(url!);
    const policy = mutationRatePolicy("/api/checkout", "POST")!;
    try {
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          consumeMutationLimit(i % 2 ? c.db : other.db, c.userId, policy),
        ),
      );
      assert.equal(results.filter((r) => r.allowed).length, 20);
      const hash = Buffer.from(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(c.userId),
        ),
      ).toString("hex");
      await c.db
        .update(apiRateLimits)
        .set({ expiresAt: sql`clock_timestamp() - interval '1 second'` })
        .where(eq(apiRateLimits.key, `v1:commerce:${hash}`));
      assert.equal(
        (await consumeMutationLimit(c.db, c.userId, policy)).allowed,
        true,
      );
    } finally {
      await other.client.end({ timeout: 1 });
    }
  }));
test("security limiter fails closed for activation when its database is unavailable", async () => {
  const response = await call(
    "/api/admin/activate",
    { method: "POST", headers: { origin: env.FRONTEND_ORIGIN }, body: "{}" },
    {
      ...env,
      HYPERDRIVE: {
        connectionString: "postgres://invalid:invalid@127.0.0.1:1/isolated",
      },
    },
  );
  assert.equal(response.status, 503);
});
test("security public activation is accessible without a session and rate limited by edge IP", async () => {
  const ip = `fixture-${randomUUID()}`;
  const headers = {
    origin: env.FRONTEND_ORIGIN,
    "cf-connecting-ip": ip,
    "content-type": "application/json",
  };
  const { db, client } = createDb(url!);
  try {
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await call("/api/admin/activate", {
            method: "POST",
            headers,
            body: "{}",
          })
        ).status,
        422,
      );
    assert.equal(
      (
        await call("/api/admin/activate", {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      429,
    );
  } finally {
    const hash = Buffer.from(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`ip:${ip}`),
      ),
    ).toString("hex");
    await db
      .delete(apiRateLimits)
      .where(eq(apiRateLimits.key, `v1:activation:${hash}`));
    await client.end({ timeout: 1 });
  }
});
test("security every custom mutation method and route category rejects cross-origin", async () => {
  for (const [method, path] of [
    ["PUT", "/api/customer/cart/items/fixture"],
    ["DELETE", "/api/customer/addresses/fixture"],
    ["POST", "/api/checkout"],
    ["POST", "/api/orders/fixture/payment-session"],
    ["POST", `/api/orders/${randomUUID()}/cancel`],
    ["POST", "/api/returns"],
    ["POST", "/api/super-admin/returns/fixture/refund/submit"],
    ["POST", "/api/admin/payouts"],
    ["PATCH", "/api/admin/catalog/products/fixture/status"],
    ["POST", "/api/admin/review/invite"],
    ["POST", "/api/admin/account/recovery-requests"],
    ["PUT", "/api/admin/shipping/providers/shiprocket"],
  ])
    assert.equal(
      (
        await call(path, {
          method,
          headers: { origin: "https://evil.example" },
          body: "{}",
        })
      ).status,
      403,
    );
});
test("security declared oversized body is rejected without pulling the stream", async () => {
  let pulls = 0,
    cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(1));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    readBoundedBody(
      new Request("http://fixture.invalid", {
        method: "POST",
        headers: { "content-length": "1000000000" },
        body,
        duplex: "half",
      } as RequestInit),
      65536,
    ),
    { status: 413 },
  );
  assert.equal(pulls, 0);
  assert.equal(cancelled, true);
});

for (const size of [65535, 65536, 65537])
  test(`security bounded body ${size} bytes`, async () => {
    const request = new Request("http://fixture.invalid", {
      method: "POST",
      body: "x".repeat(size),
    });
    if (size > 65536)
      await assert.rejects(readBoundedBody(request, 65536), { status: 413 });
    else assert.equal((await readBoundedBody(request, 65536)).length, size);
  });
test("security stream overflow cancels without draining arbitrary remainder, even with false Content-Length", async () => {
  let pulls = 0,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(40000));
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://fixture.invalid", {
    method: "POST",
    headers: { "content-length": "1" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readBoundedBody(request, 65536), { status: 413 });
  assert.equal(pulls, 2);
  assert.equal(cancelled, true);
});
for (const path of [
  "/webhooks/payments/cashfree",
  "/webhooks/shipping/events",
]) {
  test(`security ${path} keeps provider authentication and bounded parsing`, async () => {
    const headers = {
      "content-type": "application/json",
      "x-api-key": env.SHIPROCKET_WEBHOOK_TOKEN,
    };
    assert.equal(
      (
        await call(path, {
          method: "POST",
          headers: { origin: "https://evil.example" },
          body: "{}",
        })
      ).status,
      401,
    );
    for (const size of [65535, 65536, 65537]) {
      const body = " ".repeat(size),
        timestamp = String(Date.now());
      const response = await call(path, {
        method: "POST",
        headers: {
          ...headers,
          "x-webhook-timestamp": timestamp,
          "x-webhook-signature": sign(body, timestamp),
        },
        body,
      });
      assert.equal(response.status, size > 65536 ? 413 : 422);
    }
    assert.equal(
      (
        await call(path, {
          method: "POST",
          headers: { ...headers, "content-length": "1000000000" },
          body: "x",
        })
      ).status,
      413,
    );
  });
}
test("security KYC total size rejects streamed excess before multipart parse or storage", () =>
  fixture(async (c) => {
    await c.db.insert(admins).values({ userId: c.userId, status: "DRAFT" });
    let pulls = 0,
      cancelled = false,
      stored = false;
    try {
      const stream = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulls++;
            controller.enqueue(new Uint8Array(1_000_000));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      const response = await call(
        "/api/admin/onboarding/kyc/documents",
        {
          method: "POST",
          headers: {
            ...c.headers,
            "content-type": "multipart/form-data; boundary=fixture",
          },
          body: stream,
          duplex: "half",
        } as RequestInit,
        {
          ...env,
          KYC_BUCKET: {
            put: async () => {
              stored = true;
            },
            get: async () => null,
            delete: async () => {},
          },
        },
      );
      assert.equal(response.status, 413);
      assert.equal(pulls, 6);
      assert.equal(cancelled, true);
      assert.equal(stored, false);
    } finally {
      await c.db.delete(admins).where(eq(admins.userId, c.userId));
    }
  }, "ADMIN"));
test("security Cashfree fresh and retry timestamps accepted; stale, future and forged signatures rejected", async () => {
  const now = 1_800_000_000_000,
    body = "{}";
  for (const [offset, valid] of [
    [0, true],
    [-30 * 60 * 1000, true],
    [-CASHFREE_MAX_AGE_MS, true],
    [-CASHFREE_MAX_AGE_MS - 1, false],
    [CASHFREE_FUTURE_SKEW_MS, true],
    [CASHFREE_FUTURE_SKEW_MS + 1, false],
  ] as const) {
    const timestamp = String(now + offset);
    assert.equal(
      await verifyCashfreeWebhookSignature(
        body,
        timestamp,
        sign(body, timestamp),
        secret,
        now,
      ),
      valid,
    );
  }
  assert.equal(
    await verifyCashfreeWebhookSignature(
      body,
      String(now),
      "invalid",
      secret,
      now,
    ),
    false,
  );
  const stale = String(Date.now() - CASHFREE_MAX_AGE_MS - 60000);
  assert.equal(
    (
      await call("/webhooks/payments/cashfree", {
        method: "POST",
        headers: {
          "x-webhook-timestamp": stale,
          "x-webhook-signature": sign(body, stale),
        },
        body,
      })
    ).status,
    401,
  );
});
test("security legitimate KYC multipart preserves fields and private storage; file limit remains enforced", () =>
  fixture(async (c) => {
    const [admin] = await c.db
      .insert(admins)
      .values({ userId: c.userId, status: "DRAFT" })
      .returning();
    const [submission] = await c.db
      .insert(adminKycSubmissions)
      .values({
        adminId: admin.id,
        status: "DRAFT",
        legalName: "Fixture",
        businessType: "PERSON",
        contactPhone: "9999999999",
      })
      .returning();
    let writes = 0;
    const bindings = {
      ...env,
      KYC_BUCKET: {
        put: async (key: string, data: ArrayBuffer) => {
          writes++;
          assert.ok(key.startsWith(`admin/${admin.id}/`));
          assert.equal(data.byteLength, 8);
        },
        get: async () => null,
        delete: async () => {},
      },
    };
    try {
      const form = new FormData();
      form.set("documentType", "IDENTITY");
      form.set(
        "file",
        new File(
          [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
          "evidence.png",
          { type: "image/png" },
        ),
      );
      const response = await call(
        "/api/admin/onboarding/kyc/documents",
        {
          method: "POST",
          headers: { cookie: c.cookie, origin: env.FRONTEND_ORIGIN },
          body: form,
        },
        bindings,
      );
      assert.equal(response.status, 200);
      assert.equal(writes, 1);
      assert.equal(
        (
          await c.db
            .select()
            .from(adminKycDocuments)
            .where(eq(adminKycDocuments.submissionId, submission.id))
        )[0].documentType,
        "IDENTITY",
      );
      const oversized = new FormData();
      oversized.set("documentType", "IDENTITY");
      oversized.set(
        "file",
        new File([new Uint8Array(5_000_001)], "evidence.png", {
          type: "image/png",
        }),
      );
      assert.equal(
        (
          await call(
            "/api/admin/onboarding/kyc/documents",
            {
              method: "POST",
              headers: { cookie: c.cookie, origin: env.FRONTEND_ORIGIN },
              body: oversized,
            },
            bindings,
          )
        ).status,
        422,
      );
      assert.equal(writes, 1);
    } finally {
      await c.db
        .delete(adminAuditEvents)
        .where(eq(adminAuditEvents.adminId, admin.id));
      await c.db
        .delete(adminKycDocuments)
        .where(eq(adminKycDocuments.submissionId, submission.id));
      await c.db
        .delete(adminKycSubmissions)
        .where(eq(adminKycSubmissions.id, submission.id));
      await c.db.delete(admins).where(eq(admins.id, admin.id));
    }
  }, "ADMIN"));
test("security privileged catalog route records actor/entity; failed audit rolls back business write", () =>
  fixture(async (c) => {
    const slug = `security-${randomUUID()}`;
    try {
      const response = await call("/api/admin/catalog/categories", {
        method: "POST",
        headers: c.headers,
        body: JSON.stringify({ name: "Security category", slug }),
      });
      assert.equal(response.status, 200);
      const category = (await response.json()) as { id: string };
      const [event] = await c.db
        .select()
        .from(adminAuditEvents)
        .where(eq(adminAuditEvents.entityId, category.id));
      assert.equal(event.actorUserId, c.userId);
      assert.equal(event.entityType, "CATEGORY");
      assert.equal(event.action, "CATEGORY_CREATED");
      await assert.rejects(
        auditedMutation(
          c.db,
          "missing-security-actor",
          "CATEGORY_CREATED",
          "CATEGORY",
          (tx) =>
            createCategory(tx, { name: "Rollback", slug: slug + "-rollback" }),
          (result) => result.id,
        ),
      );
      assert.equal(
        (
          await c.db
            .select()
            .from(categories)
            .where(eq(categories.slug, slug + "-rollback"))
        ).length,
        0,
      );
      assert.equal(
        (
          await c.db
            .select()
            .from(adminAuditEvents)
            .where(eq(adminAuditEvents.actorUserId, "missing-security-actor"))
        ).length,
        0,
      );
    } finally {
      await c.db.delete(categories).where(eq(categories.slug, slug));
    }
  }, "SUPER_ADMIN"));
test("security invitations and reissue retain actor/entity without raw tokens", () =>
  fixture(async (c) => {
    await c.db.insert(roles).values({ name: "ADMIN" }).onConflictDoNothing();
    const email = `invited-${randomUUID()}@example.invalid`;
    const invite = await createInvitation(c.db, {
      email,
      name: "Invited fixture",
      invitedByUserId: c.userId,
    });
    const [invited] = await c.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    try {
      const replacement = await reissueInvitation(c.db, {
        email,
        invitedByUserId: c.userId,
      });
      const events = await c.db
        .select()
        .from(adminAuditEvents)
        .where(eq(adminAuditEvents.adminId, invite.adminId));
      assert.deepEqual(events.map((e) => e.action).sort(), [
        "ADMIN_INVITED",
        "ADMIN_REINVITED",
      ]);
      for (const e of events) {
        assert.equal(e.actorUserId, c.userId);
        assert.equal(e.entityId, invite.adminId);
      }
      assert.ok(!JSON.stringify(events).includes(invite.rawToken));
      assert.ok(!JSON.stringify(events).includes(replacement.rawToken));
    } finally {
      await c.db
        .delete(verifications)
        .where(
          sql`${verifications.value}::jsonb ->> 'adminId' = ${invite.adminId}`,
        );
      await c.db
        .delete(adminAuditEvents)
        .where(eq(adminAuditEvents.adminId, invite.adminId));
      await c.db.delete(admins).where(eq(admins.id, invite.adminId));
      await c.db.delete(userRoles).where(eq(userRoles.userId, invited.id));
      await c.db.delete(users).where(eq(users.id, invited.id));
    }
  }, "SUPER_ADMIN"));
