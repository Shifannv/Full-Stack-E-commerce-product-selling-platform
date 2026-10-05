/**
 * Password-reset email sender.
 *
 * Uses Resend as the email provider via a direct fetch call, following
 * the same pattern as invitation-email.service.ts.
 *
 * Security:
 * - Raw token is embedded in the reset link only; it is NEVER logged.
 * - Email delivery is best-effort: failure does NOT rollback the token
 *   record. The user may request another reset.
 * - If RESEND_API_KEY or RESEND_FROM_EMAIL is absent, delivery is
 *   skipped and the caller receives { delivered: false, reason: "..." }.
 */

export type PasswordResetEmailResult =
  | { delivered: true; id: string }
  | { delivered: false; reason: string };

export type PasswordResetEmailInput = {
  toEmail: string;
  toName: string;
  rawToken: string;
  expiresAt: Date;
  /** Full URL of the frontend reset-password page (without query params). */
  resetPageUrl: string;
  fromEmail: string;
  resendApiKey: string;
};

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
): Promise<PasswordResetEmailResult> {
  const { toEmail, toName, rawToken, expiresAt, resetPageUrl, fromEmail, resendApiKey } = input;

  if (!resendApiKey || !fromEmail) {
    return {
      delivered: false,
      reason: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured",
    };
  }

  // Build the reset URL — token in query param, never logged.
  const url = new URL(resetPageUrl);
  url.searchParams.set("token", rawToken);
  const resetUrl = url.toString();

  const expiryStr = expiresAt.toUTCString();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Reset your Ownline Dropship password</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:22px;margin-bottom:8px">Reset your password</h1>
  <p>Hi ${escapeHtml(toName)},</p>
  <p>We received a request to reset the password for your <strong>Ownline Dropship</strong> account. Click the button below to set a new password.</p>
  <p style="margin:32px 0">
    <a href="${escapeHtml(resetUrl)}"
       style="background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
      Reset your password
    </a>
  </p>
  <p style="font-size:14px;color:#555">This link expires at <strong>${expiryStr}</strong> and can only be used once.</p>
  <p style="font-size:12px;color:#888">If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>
</body>
</html>
  `.trim();

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: "Reset your Ownline Dropship password",
        html,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // Network error — do NOT expose details.
    return {
      delivered: false,
      reason: "Email delivery failed (network error)",
    };
  }

  if (!response.ok) {
    console.error("Resend password-reset delivery failed", { status: response.status });
    return {
      delivered: false,
      reason: `Email delivery failed (provider status ${response.status})`,
    };
  }

  let body: { id?: string };
  try {
    body = (await response.json()) as { id?: string };
  } catch {
    return {
      delivered: false,
      reason: "Email delivery response was unreadable",
    };
  }

  if (!body.id)
    return { delivered: false, reason: "Resend did not return a message ID" };
  return { delivered: true, id: body.id };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
