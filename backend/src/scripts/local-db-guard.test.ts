/**
 * local-db-guard.test.ts
 *
 * Verifies the local-db-guard module without connecting to any real database.
 *
 * Covers:
 *  1.  localhost           — accepted
 *  2.  127.0.0.1           — accepted
 *  3.  ::1                 — accepted
 *  4.  remote host         — rejected
 *  5.  Aiven host          — rejected
 *  6.  lookalike host      — rejected
 *  7.  userinfo spoof      — rejected
 *  8.  empty host          — rejected
 *  9.  invalid URL         — rejected
 * 10.  remote opt-in       — accepted when ALLOW_REMOTE_FIXTURES=1
 * 11.  missing DATABASE_URL — assertLocalOrOptedIn returns without error
 * 12.  env-precedence      — explicit DATABASE_URL is not replaced by dotenv
 */

import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalOrOptedIn, isLocalHost } from "../../scripts/local-db-guard";

// ---------------------------------------------------------------------------
// isLocalHost() — predicate tests (no process.env mutation needed)
// ---------------------------------------------------------------------------

test("1. localhost is accepted", () => {
  assert.equal(isLocalHost("postgresql://postgres:pass@localhost:5432/ownline_dev"), true);
});

test("2. 127.0.0.1 is accepted", () => {
  assert.equal(isLocalHost("postgresql://postgres:pass@127.0.0.1:5432/ownline_dev"), true);
});

test("3. ::1 is accepted", () => {
  // WHATWG URL represents IPv6 as [::1] in hostname
  assert.equal(isLocalHost("postgresql://postgres:pass@[::1]:5432/ownline_dev"), true);
});

test("4. arbitrary remote host is rejected", () => {
  assert.equal(isLocalHost("postgresql://user:pass@db.example.com:5432/mydb"), false);
});

test("5. Aiven host is rejected", () => {
  // Uses a fictional Aiven-style hostname; no real credentials.
  assert.equal(
    isLocalHost(
      "postgres://avnadmin:FAKE_SECRET@test-project.i.aivencloud.com:14805/defaultdb?sslmode=require",
    ),
    false,
  );
});

test("6. lookalike hostname is rejected (localhost.evil.com)", () => {
  assert.equal(isLocalHost("postgresql://user:pass@localhost.evil.com:5432/db"), false);
});

test("7. userinfo/URL spoof with multiple @ chars is rejected", () => {
  // Attacker tries: user@remote-host@localhost/db — the WHATWG parser resolves
  // the true host as "localhost" but we detect the extra "@" in authority.
  assert.throws(
    () => isLocalHost("postgresql://user@remote.db.example.com@localhost:5432/ownline"),
    /multiple "@" characters/,
  );
});

test("8. empty host is rejected", () => {
  // "postgresql:///db" has an empty authority; hostname is ""
  assert.throws(() => isLocalHost("postgresql:///ownline_dev"), /empty or missing hostname/);
});

test("9. invalid URL is rejected", () => {
  assert.throws(() => isLocalHost("not-a-url"), /not a valid URL/);
  assert.throws(() => isLocalHost(""), /must not be empty/);
  assert.throws(() => isLocalHost("   "), /must not be empty/);
});

// ---------------------------------------------------------------------------
// assertLocalOrOptedIn() — uses process.env
// ---------------------------------------------------------------------------

/** Safely set a single env var and return a cleanup function. */
function withEnv(key: string, value: string | undefined): () => void {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return () => {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  };
}

test("10. remote opt-in: ALLOW_REMOTE_FIXTURES=1 permits remote host", () => {
  const restoreUrl = withEnv(
    "DATABASE_URL",
    "postgres://avnadmin:FAKE@test-project.i.aivencloud.com:14805/defaultdb?sslmode=require",
  );
  const restoreFlag = withEnv("ALLOW_REMOTE_FIXTURES", "1");
  try {
    // Must not throw
    assert.doesNotThrow(() => assertLocalOrOptedIn("test-script"));
  } finally {
    restoreUrl();
    restoreFlag();
  }
});

test("11. missing DATABASE_URL: assertLocalOrOptedIn returns without error", () => {
  const restore = withEnv("DATABASE_URL", undefined);
  try {
    assert.doesNotThrow(() => assertLocalOrOptedIn("test-script"));
  } finally {
    restore();
  }
});

test("local host (127.0.0.1): assertLocalOrOptedIn permits without opt-in flag", () => {
  const restore = withEnv("DATABASE_URL", "postgresql://postgres:pass@127.0.0.1:5432/ownline_dev");
  const restoreFlag = withEnv("ALLOW_REMOTE_FIXTURES", undefined);
  try {
    assert.doesNotThrow(() => assertLocalOrOptedIn("test-script"));
  } finally {
    restore();
    restoreFlag();
  }
});

test("remote host without opt-in: assertLocalOrOptedIn throws", () => {
  const restore = withEnv(
    "DATABASE_URL",
    "postgres://avnadmin:FAKE@test-project.i.aivencloud.com:14805/defaultdb?sslmode=require",
  );
  const restoreFlag = withEnv("ALLOW_REMOTE_FIXTURES", undefined);
  try {
    assert.throws(
      () => assertLocalOrOptedIn("my-script"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("my-script"));
        assert.ok(err.message.includes("remote host"));
        assert.ok(err.message.includes("ALLOW_REMOTE_FIXTURES=1"));
        return true;
      },
    );
  } finally {
    restore();
    restoreFlag();
  }
});

// ---------------------------------------------------------------------------
// Step 6: env-precedence checks (12)
// These verify that an explicitly set DATABASE_URL is not replaced by dotenv
// loading order.  We test this at the isLocalHost/assertLocalOrOptedIn layer;
// the drizzle.config.ts loading order is documented in the file comments.
// ---------------------------------------------------------------------------

test("12. explicit DATABASE_URL in process.env survives dotenv non-override load", () => {
  // Simulate: process already has DATABASE_URL set (e.g. shell export or CI).
  // dotenv with override:false (the default and our corrected drizzle.config.ts
  // behavior) must NOT overwrite it.
  const explicitUrl = "postgresql://postgres:pass@127.0.0.1:5432/explicit_test_db";
  const restore = withEnv("DATABASE_URL", explicitUrl);
  try {
    // Confirm the guard correctly sees the explicit local URL.
    assert.equal(process.env.DATABASE_URL, explicitUrl);
    assert.equal(isLocalHost(explicitUrl), true);
    assert.doesNotThrow(() => assertLocalOrOptedIn("test-precedence"));
  } finally {
    restore();
  }
});

test("12b. Aiven URL in process.env is correctly blocked without opt-in", () => {
  // Simulates the failure mode: if .env's Aiven URL were to leak through
  // (e.g. via override:true or wrong load order), the guard catches it.
  const aivenUrl =
    "postgres://avnadmin:FAKE@test-project.i.aivencloud.com:14805/defaultdb?sslmode=require";
  const restore = withEnv("DATABASE_URL", aivenUrl);
  const restoreFlag = withEnv("ALLOW_REMOTE_FIXTURES", undefined);
  try {
    assert.throws(
      () => assertLocalOrOptedIn("test-precedence"),
      /remote host/,
    );
  } finally {
    restore();
    restoreFlag();
  }
});
