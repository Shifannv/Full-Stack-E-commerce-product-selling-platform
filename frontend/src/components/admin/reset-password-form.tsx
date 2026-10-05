"use client";

/**
 * Admin reset-password form.
 *
 * SECURITY:
 * - Raw token is read from ?token= URL parameter.
 * - Token is NEVER logged, stored in component state with logging, sent to
 *   analytics, or displayed in the UI.
 * - Token validation (GET /validate) runs on mount; invalid/expired token
 *   shows an error before the form appears.
 * - Password policy matches backend: 12–128 characters.
 * - Confirmation must match.
 * - On success: all existing sessions are invalidated by the backend.
 *   Frontend redirects to sign-in.
 */

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { passwordResetApi } from "@/lib/api/password-reset";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type Phase =
  | "validating"      // Checking token with backend
  | "invalid"         // Token missing, expired or used
  | "ready"           // Form shown, waiting for user input
  | "submitting"      // POST in progress
  | "success"         // Password changed, sessions invalidated
  | "error";          // Backend/network error during reset

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  // Read token from URL — do not store in a variable named "token" that could
  // be confused with a persistent reference. Use "rawToken" internally.
  const rawToken = searchParams.get("token") ?? "";

  const [phase, setPhase] = useState<Phase>(rawToken ? "validating" : "invalid");
  const [invalidReason, setInvalidReason] = useState<string>(
    rawToken ? "" : "No reset token was provided. Please use the link from your email.",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!rawToken) return;
    let active = true;
    passwordResetApi
      .validateToken(rawToken)
      .then((info) => {
        if (!active) return;
        setExpiresAt(new Date(info.expiresAt));
        setPhase("ready");
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 422) {
          setInvalidReason(
            "This password-reset link is invalid or has already expired. Please request a new one.",
          );
        } else {
          setInvalidReason(
            "The reset service is temporarily unavailable. Please try again shortly.",
          );
        }
        setPhase("invalid");
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount — rawToken captured from URL at page load

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "ready") return;

    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setErrorMsg(`Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirm) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setPhase("submitting");
    setErrorMsg(null);
    try {
      await passwordResetApi.resetPassword(rawToken, newPassword);
      setPhase("success");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 422) {
        setInvalidReason(
          "This reset link has expired or was already used. Please request a new one.",
        );
        setPhase("invalid");
      } else {
        setErrorMsg(
          "The reset could not be completed. Please try again or request a new link.",
        );
        setPhase("error");
      }
    }
  }

  return (
    <div className="min-h-svh bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <Link
          href="/admin"
          className="mb-10 block text-center text-sm font-semibold tracking-[0.12em] uppercase text-muted-foreground hover:text-foreground transition-colors"
        >
          Ownline <span className="opacity-60">Admin</span>
        </Link>

        <div className="rounded-xl border border-border bg-card p-8 shadow-soft">
          {phase === "validating" && (
            <p role="status" className="text-center text-sm text-muted-foreground">
              Validating reset link…
            </p>
          )}

          {phase === "invalid" && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <svg aria-hidden="true" className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Link invalid or expired</h1>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{invalidReason}</p>
              <Link
                href="/admin/forgot-password"
                className="mt-5 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Request a new link
              </Link>
              <div className="mt-4">
                <Link
                  href="/admin"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to sign in
                </Link>
              </div>
            </div>
          )}

          {phase === "success" && (
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <svg aria-hidden="true" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Your password has been changed. All existing sessions have been
                signed out for security.
              </p>
              <Link
                href="/admin"
                className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Sign in with your new password
              </Link>
            </div>
          )}

          {(phase === "ready" || phase === "submitting" || phase === "error") && (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Set a new password</h1>
              {expiresAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Link expires{" "}
                  <time dateTime={expiresAt.toISOString()}>
                    {expiresAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                </p>
              )}

              <form onSubmit={(e) => void handleSubmit(e)} className="mt-7 space-y-5" noValidate>
                <label className="block">
                  <span className="block text-sm font-medium mb-2">New password</span>
                  <input
                    id="admin-reset-password-new"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={MIN_PASSWORD_LENGTH}
                    maxLength={MAX_PASSWORD_LENGTH}
                    disabled={phase === "submitting"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-shadow"
                    placeholder="12+ characters"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Minimum {MIN_PASSWORD_LENGTH} characters.
                  </span>
                </label>

                <label className="block">
                  <span className="block text-sm font-medium mb-2">Confirm new password</span>
                  <input
                    id="admin-reset-password-confirm"
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    disabled={phase === "submitting"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-shadow"
                    placeholder="Re-enter password"
                  />
                </label>

                {errorMsg && (
                  <p role="alert" className="text-sm text-destructive">{errorMsg}</p>
                )}

                <Button
                  id="admin-reset-password-submit"
                  type="submit"
                  disabled={phase === "submitting"}
                  className="w-full"
                >
                  {phase === "submitting" ? "Updating password…" : "Set new password"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/admin/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Request a different link
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Export must wrap in Suspense because useSearchParams() requires it in
 * Next.js static export mode.
 */
export function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-svh flex items-center justify-center">
        <p role="status" className="text-sm text-muted-foreground">Loading…</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
