/**
 * Password-reset routes. Mounted at /api/password-reset by routes/index.ts.
 *
 * POST /api/password-reset/forgot-password
 *   Anonymous. Rate-limited by CF edge IP (or shared unknown-IP bucket).
 *   Enumeration-safe: always returns 200 { message: "..." } regardless of
 *   whether the email exists.
 *
 * GET  /api/password-reset/validate?token=<raw>
 *   Anonymous. Peek at a token (expiry, role) without consuming it.
 *   Used by the frontend to validate before showing the form.
 *
 * POST /api/password-reset/reset-password
 *   Anonymous. The raw token itself is the authorization credential.
 *   Validates, consumes the token, updates the password, invalidates sessions.
 *
 * SUPER ADMIN accounts are explicitly excluded from both endpoints at the
 * service layer; no Super Admin reset email is ever sent.
 */

import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AuthorizedEnv } from "../../middleware/authorization";
import { createDb } from "../../db";
import { DomainError } from "../../services/admin/admin.service";
import {
  initiatePasswordReset,
  consumePasswordReset,
  peekPasswordResetToken,
} from "../../services/password-reset/password-reset.service";
import { sendPasswordResetEmail } from "../../services/password-reset/password-reset-email.service";
import { consumeMutationLimit } from "../../middleware/rate-limit";

/** Shared bindings needed by both password-reset endpoints. */
type PasswordResetEnv = AuthorizedEnv & {
  Bindings: AuthorizedEnv["Bindings"] & {
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    /** Frontend page that renders the reset-password form, e.g. http://127.0.0.1:3000/reset-password */
    PASSWORD_RESET_URL?: string;
  };
};

export const passwordResetRoutes = new Hono<PasswordResetEnv>();

passwordResetRoutes.onError((error, c) => {
  if (error instanceof DomainError)
    return c.json({ error: error.message }, error.status);
  console.error("Password reset request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return c.json({ error: "Password reset unavailable" }, 503);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withDb<T>(
  connectionString: string,
  action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>,
): Promise<T> {
  const { client, db } = createDb(connectionString);
  try {
    return await action(db);
  } finally {
    await client.end({ timeout: 1 }).catch(() => undefined);
  }
}

async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DomainError("Invalid JSON body", 422);
  return value as Record<string, unknown>;
}

/** Rate-limit key derived from CF edge IP; falls back to shared unknown-IP bucket. */
function ipIdentity(c: { req: { header: (name: string) => string | undefined } }): string {
  return `ip:${c.req.header("cf-connecting-ip") ?? "unknown"}`;
}

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// ---------------------------------------------------------------------------
passwordResetRoutes.post("/forgot-password", async (c) => {
  // Rate-limit by edge IP: 5 requests per 600 seconds per IP.
  // Uses the existing consumeMutationLimit infrastructure.
  let client: ReturnType<typeof createDb>["client"] | undefined;
  try {
    const connection = createDb(c.env.HYPERDRIVE.connectionString);
    client = connection.client;
    const result = await consumeMutationLimit(connection.db, ipIdentity(c), {
      group: "pwd-reset",
      limit: 5,
      seconds: 600,
    });
    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfter));
      return c.json({ error: "Too many requests" }, 429);
    }
  } catch {
    c.header("Retry-After", "5");
    return c.json({ error: "Request protection unavailable" }, 503);
  } finally {
    await client?.end({ timeout: 1 }).catch(() => undefined);
  }

  let body: Record<string, unknown>;
  try {
    body = await jsonBody(c);
  } catch {
    // Return generic success even for a malformed body to avoid probing.
    return c.json({ message: "If that email is registered, a reset link has been sent." });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    // Generic — do not reveal validation details.
    return c.json({ message: "If that email is registered, a reset link has been sent." });
  }

  // Attempt to initiate reset; returns null for unknown/ineligible emails.
  const resetData = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    initiatePasswordReset(db, email),
  );

  if (resetData) {
    // Determine the reset page URL — fall back to local dev origin.
    const resetPageUrl =
      c.env.PASSWORD_RESET_URL ??
      `${c.env.FRONTEND_ORIGIN}/reset-password`;

    // Fire-and-forget email; delivery failure does NOT affect the response.
    sendPasswordResetEmail({
      toEmail: resetData.toEmail,
      toName: resetData.toName,
      rawToken: resetData.rawToken,
      expiresAt: resetData.expiresAt,
      resetPageUrl,
      fromEmail: c.env.RESEND_FROM_EMAIL ?? "",
      resendApiKey: c.env.RESEND_API_KEY ?? "",
    }).catch((err) => {
      // Do NOT log the token or URL.
      console.error("Password reset email dispatch failed", {
        name: err instanceof Error ? err.name : "UnknownError",
      });
    });
  }

  // Always return the same generic response — enumeration protection.
  return c.json({ message: "If that email is registered, a reset link has been sent." });
});

// ---------------------------------------------------------------------------
// GET /api/password-reset/validate?token=<raw>
// Peek — validates without consuming, for frontend pre-flight.
// ---------------------------------------------------------------------------
passwordResetRoutes.get("/validate", async (c) => {
  const rawToken = c.req.query("token") ?? "";
  if (!rawToken) return c.json({ error: "token is required" }, 422);

  const info = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    peekPasswordResetToken(db, rawToken),
  );
  return c.json({ expiresAt: info.expiresAt, role: info.role });
});

// ---------------------------------------------------------------------------
// POST /api/password-reset/reset-password
// ---------------------------------------------------------------------------
passwordResetRoutes.post("/reset-password", async (c) => {
  const body = await jsonBody(c);

  const rawToken = typeof body.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body.password === "string" ? body.password : "";

  if (!rawToken) throw new DomainError("token is required", 422);
  if (!newPassword) throw new DomainError("password is required", 422);

  const result = await withDb(c.env.HYPERDRIVE.connectionString, (db) =>
    consumePasswordReset(db, rawToken, newPassword),
  );

  return c.json({ message: "Password reset successfully. Please sign in with your new password." });
});
