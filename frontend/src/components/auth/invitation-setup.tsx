"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InvitationSetup() {
  const token = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [validToken, setValidToken] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token.current === null) {
      const url = new URL(window.location.href);
      token.current = url.searchParams.get("token") ?? "";
      url.searchParams.delete("token");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search,
      );
    }
    setValidToken(/^[A-Za-z0-9_-]{64}$/.test(token.current));
    setReady(true);
  }, []);

  async function activate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) {
      setError(
        "Passwords do not match. Enter the same password in both fields.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/activate", {
        method: "POST",
        body: JSON.stringify({ token: token.current, password }),
        referrerPolicy: "no-referrer",
      });
      token.current = "";
      setPassword("");
      setConfirmation("");
      setComplete(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Account setup failed. Try again or ask for a new invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (complete)
    return (
      <div role="status" className="mt-6 space-y-3">
        <h2 className="text-xl font-semibold">Your account is activated</h2>
        <p className="text-muted-foreground">
          Your password is set. Seller onboarding and approval are still
          required before you can manage products. Contact the person who
          invited you for the next step.
        </p>
      </div>
    );
  if (!ready)
    return (
      <p role="status" className="mt-6 text-muted-foreground">
        Loading your invitation…
      </p>
    );
  if (!validToken)
    return (
      <p role="alert" className="mt-6 text-muted-foreground">
        This invitation link is incomplete. Open the full link from your
        invitation email or ask for a new invitation.
      </p>
    );
  return (
    <form onSubmit={(event) => void activate(event)} className="mt-6 space-y-5">
      <p className="text-muted-foreground">
        Choose a password to activate your invited seller account. This
        invitation can be used once.
      </p>
      <div>
        <label
          htmlFor="setup-password"
          className="mb-2 block text-sm font-medium"
        >
          Password
        </label>
        <Input
          id="setup-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-describedby="password-help"
          disabled={busy}
        />
        <p id="password-help" className="mt-2 text-sm text-muted-foreground">
          Use 12 to 256 characters.
        </p>
      </div>
      <div>
        <label
          htmlFor="setup-confirmation"
          className="mb-2 block text-sm font-medium"
        >
          Confirm password
        </label>
        <Input
          id="setup-confirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={busy}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} If your invitation has expired or was already used, ask for a
          new one.
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? "Activating account…" : "Activate account"}
      </Button>
    </form>
  );
}
