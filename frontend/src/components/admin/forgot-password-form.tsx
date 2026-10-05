"use client";

/**
 * Admin forgot-password form.
 *
 * SECURITY:
 * - Never reveals whether the email exists.
 * - Existing and unknown emails produce identical UI behaviour.
 * - Never logs or displays tokens.
 * - Password policy matches the backend minimum: 12 characters.
 */

import { useState } from "react";
import Link from "next/link";
import { passwordResetApi } from "@/lib/api/password-reset";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

type State = "idle" | "submitting" | "sent" | "error";

export function ForgotPasswordPage() {
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) return;

    setState("submitting");
    setErrorMsg(null);
    try {
      // The API always returns 200 regardless of whether the email exists.
      // We show the same success message either way — enumeration protection.
      await passwordResetApi.forgotPassword(email);
      setState("sent");
    } catch (reason) {
      // Rate-limited (429) or service unavailable — show safe message.
      if (reason instanceof ApiError && reason.status === 429) {
        setErrorMsg(
          "Too many reset requests. Please wait a few minutes and try again.",
        );
      } else {
        setErrorMsg(
          "The reset service is temporarily unavailable. Please try again shortly.",
        );
      }
      setState("error");
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
          {state === "sent" ? (
            /* Success — identical for existing and unknown emails */
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <svg aria-hidden="true" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                If that email address is registered to a seller account, you will
                receive a password-reset link shortly. The link expires in 1 hour.
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                Did not receive an email? Check your spam folder, or wait a moment
                and try again.
              </p>
              <Link
                href="/admin"
                className="mt-6 block text-sm font-medium text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold tracking-tight">Forgot your password?</h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Enter your seller account email address. If an account exists, we
                will send you a link to set a new password.
              </p>

              <form onSubmit={(e) => void handleSubmit(e)} className="mt-7 space-y-5" noValidate>
                <label className="block">
                  <span className="block text-sm font-medium mb-2">Email address</span>
                  <input
                    id="admin-forgot-password-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    disabled={state === "submitting"}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-shadow"
                    placeholder="you@example.com"
                  />
                </label>

                {errorMsg && (
                  <p role="alert" className="text-sm text-destructive">
                    {errorMsg}
                  </p>
                )}

                <Button
                  id="admin-forgot-password-submit"
                  type="submit"
                  disabled={state === "submitting"}
                  className="w-full"
                >
                  {state === "submitting" ? "Sending…" : "Send reset link"}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/admin"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
