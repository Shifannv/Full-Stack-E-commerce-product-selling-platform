/**
 * Admin invitation email sender.
 *
 * Uses Resend as the email provider. The sender address must be a
 * verified domain in the Resend dashboard.
 *
 * Security:
 * - Raw token is embedded in the setup link only; it is not logged.
 * - Email delivery is best-effort: failure does NOT rollback the
 *   invitation record. The operator re-invites to generate a new token.
 *
 * If RESEND_API_KEY or RESEND_FROM_EMAIL is absent, delivery is skipped
 * and the caller receives { delivered: false, reason: "..." }.
 */

import { invitationLink } from "./invitation-url";

export type InvitationEmailResult =
  { delivered: true; id: string } | { delivered: false; reason: string };

export type InvitationEmailInput = {
  toEmail: string;
  toName: string;
  rawToken: string;
  expiresAt: Date;
  /** HTTPS setup page, or the exact loopback development origin. */
  setupPageUrl: string;
  fromEmail: string;
  resendApiKey: string;
};

export async function sendInvitationEmail(
  input: InvitationEmailInput,
): Promise<InvitationEmailResult> {
  const {
    toEmail,
    toName,
    rawToken,
    expiresAt,
    setupPageUrl,
    fromEmail,
    resendApiKey,
  } = input;

  if (!resendApiKey || !fromEmail) {
    return {
      delivered: false,
      reason: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured",
    };
  }

  const setupUrl = invitationLink(setupPageUrl, rawToken);
  const expiryStr = expiresAt.toUTCString();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Admin Account Setup</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
  <h1 style="font-size:22px;margin-bottom:8px">You have been invited to Ownline Dropship</h1>
  <p>Hi ${escapeHtml(toName)},</p>
  <p>A Super Admin has invited you to set up your seller account on <strong>Ownline Dropship</strong>. Click the button below to set your password and activate your account.</p>
  <p style="margin:32px 0">
    <a href="${escapeHtml(setupUrl)}"
       style="background:#4f46e5;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">
      Set up your account
    </a>
  </p>
  <p style="font-size:14px;color:#555">This link expires at <strong>${expiryStr}</strong> and can only be used once.</p>
  <p style="font-size:12px;color:#888">If you did not expect this invitation, you may safely ignore this email.</p>
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
        subject: "Set up your seller admin account",
        html,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    // Network error — do NOT expose details.
    return {
      delivered: false,
      reason: "Email delivery failed (network error)",
    };
  }

  if (!response.ok) {
    // Log only safe diagnostics.
    console.error("Resend delivery failed", { status: response.status });
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
