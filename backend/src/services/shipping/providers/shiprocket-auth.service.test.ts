import assert from "node:assert/strict";
import test from "node:test";
import {
  ShiprocketAuthService,
  shiprocketBaseUrl,
} from "./shiprocket-auth.service";

test("Shiprocket authentication shares a pending login and reuses the token", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    calls++;
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      email: "api@example.com",
      password: "secret",
    });
    return Response.json({ token: "private-token" });
  };
  const auth = new ShiprocketAuthService("api@example.com", "secret", fetcher);
  assert.deepEqual(await Promise.all([auth.getToken(), auth.getToken()]), [
    "private-token",
    "private-token",
  ]);
  assert.equal(await auth.getToken(), "private-token");
  assert.equal(calls, 1);
});

test("missing or invalid credentials fail without caching a token", async () => {
  const never: typeof fetch = async () => {
    throw new Error("Network should not be called");
  };
  await assert.rejects(
    new ShiprocketAuthService("", "", never).getToken(),
    /credentials are required/,
  );
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  };
  const auth = new ShiprocketAuthService("api@example.com", "wrong", fetcher);
  await assert.rejects(auth.getToken(), /authentication failed \(401\)/);
  await assert.rejects(auth.getToken(), /authentication failed \(401\)/);
  assert.equal(calls, 2);
});

test("expired tokens and explicit 401 invalidation trigger refresh", async () => {
  let now = 1_800_000_000_000;
  let calls = 0;
  const fetcher: typeof fetch = async () =>
    Response.json({ token: `token-${++calls}` });
  const auth = new ShiprocketAuthService(
    "api@example.com",
    "secret",
    fetcher,
    undefined,
    () => now,
  );
  const first = await auth.getToken();
  auth.invalidateToken("a different token");
  assert.equal(await auth.getToken(), first);
  auth.invalidateToken(first);
  assert.equal(await auth.getToken(), "token-2");
  now += 9 * 24 * 60 * 60 * 1000 + 1;
  assert.equal(await auth.getToken(), "token-3");
});

test("provider failures and invalid responses do not return a token", async () => {
  const failure: typeof fetch = async () => Response.json({}, { status: 503 });
  const malformed: typeof fetch = async () => Response.json({ token: null });
  await assert.rejects(
    new ShiprocketAuthService("api@example.com", "secret", failure).getToken(),
    /authentication failed \(503\)/,
  );
  await assert.rejects(
    new ShiprocketAuthService(
      "api@example.com",
      "secret",
      malformed,
    ).getToken(),
    /response is invalid/,
  );
});

test("a provider 403 fails once without retrying login or exposing its response", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return Response.json(
      { message: "private-provider-detail" },
      { status: 403 },
    );
  };
  const auth = new ShiprocketAuthService("api@example.com", "secret", fetcher);
  await assert.rejects(auth.getToken(), (error: unknown) => {
    assert.equal(
      (error as Error).message,
      "Shiprocket authentication failed (403)",
    );
    return true;
  });
  assert.equal(calls, 1);
});

test("Shiprocket API base URL is constrained to the official HTTPS endpoint", () => {
  assert.equal(
    shiprocketBaseUrl(undefined),
    "https://apiv2.shiprocket.in/v1/external",
  );
  assert.throws(
    () => shiprocketBaseUrl("https://example.com/v1/external"),
    /Invalid Shiprocket API base URL/,
  );
  assert.throws(
    () => shiprocketBaseUrl("http://apiv2.shiprocket.in/v1/external"),
    /Invalid Shiprocket API base URL/,
  );
});
