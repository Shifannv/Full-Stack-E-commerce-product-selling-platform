/**
 * Password-reset API client.
 *
 * Wraps the three verified anonymous endpoints:
 *   POST /api/password-reset/forgot-password
 *   GET  /api/password-reset/validate?token=<raw>
 *   POST /api/password-reset/reset-password
 *
 * SECURITY:
 * - Raw token is read from URL; it is NEVER logged, stored in state labels,
 *   sent to analytics, or displayed in the UI.
 * - All three endpoints are anonymous (no session required).
 * - The forgot-password response is intentionally generic; the caller must
 *   show an identical message regardless of whether the email exists.
 */

import { api, json } from "./client";

export type TokenInfo = { expiresAt: string; role: string };

export const passwordResetApi = {
  /**
   * Request a password-reset email.
   * Always returns the same generic message — enumeration-safe.
   * Rate-limited by the backend (5 req / 600 s / IP).
   */
  forgotPassword: (email: string) =>
    api<{ message: string }>("/api/password-reset/forgot-password", {
      method: "POST",
      body: json({ email }),
    }),

  /**
   * Validate a raw token without consuming it.
   * Returns expiry + role if valid, throws ApiError(422) if invalid/expired.
   */
  validateToken: (rawToken: string) =>
    api<TokenInfo>(
      `/api/password-reset/validate?token=${encodeURIComponent(rawToken)}`,
    ),

  /**
   * Consume a reset token and replace the user's password.
   * Invalidates all existing sessions on success.
   */
  resetPassword: (rawToken: string, newPassword: string) =>
    api<{ message: string }>("/api/password-reset/reset-password", {
      method: "POST",
      body: json({ token: rawToken, password: newPassword }),
    }),
};
