"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authApi, ApiError, type Actor } from "@/lib/api";
import { describeApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { InitialPasswordChange } from "@/components/layout/operator-workspace";

type GateState =
  | "loading"
  | "signed-out"
  | "allowed"
  | "forbidden"
  | "error"
  | "must-change-password";

/**
 * Role gate for both operator workspaces. Backend authorization is the real boundary — this
 * only decides what to render, exactly mirroring what the Worker will and will not accept:
 * a forced-password-change Admin can reach nothing but the change form and sign-out, and an
 * authenticated user without the matching role sees "forbidden", never the workspace underneath.
 */
export function OperatorGate({
  role,
  children,
}: {
  role: "admin" | "super-admin";
  children: (actor: Actor) => React.ReactNode;
}) {
  const [state, setState] = useState<GateState>("loading");
  const [actor, setActor] = useState<Actor | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    authApi
      .me()
      .then((result) => {
        if (!active) return;
        setActor(result);
        if (result.mustChangePassword && role === "admin") {
          setState("must-change-password");
          return;
        }
        setState(
          result.roles.includes(role === "admin" ? "ADMIN" : "SUPER_ADMIN")
            ? "allowed"
            : "forbidden",
        );
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason);
        setState(reason instanceof ApiError && reason.status === 401 ? "signed-out" : "error");
      });
    return () => {
      active = false;
    };
  }, [role, attempt]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setSignInError(null);
    try {
      await authApi.signIn(String(form.get("email")), String(form.get("password")));
      setState("loading");
      setAttempt((value) => value + 1);
    } catch (reason) {
      setSignInError(describeApiError(reason, "session").message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await authApi.signOut();
    } finally {
      setBusy(false);
      setState("signed-out");
      setActor(null);
    }
  }

  if (state === "loading")
    return (
      <p role="status" className="py-16 text-center text-sm text-muted-foreground">
        Checking your workspace…
      </p>
    );

  if (state === "forbidden" || state === "error") {
    const described = state === "error" ? describeApiError(error, "session") : null;
    return (
      <div className="mx-auto max-w-lg rounded-md border border-border bg-card p-8 text-center">
        <h1 className="op-title">
          {state === "forbidden" ? "This workspace needs another account" : described?.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {state === "forbidden"
            ? `Sign in with an authorized ${role === "admin" ? "seller" : "Super Admin"} account.`
            : described?.message}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void signOut()}>
            Sign out
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setState("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (state === "must-change-password")
    return (
      <InitialPasswordChange
        onDone={() => {
          setState("loading");
          setAttempt((value) => value + 1);
        }}
        onSignOut={() => void signOut()}
      />
    );

  if (state === "signed-out")
    return (
      <div className="mx-auto max-w-sm">
        <h1 className="op-title">
          {role === "admin" ? "Seller sign-in" : "Platform sign-in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to manage {role === "admin" ? "your seller account" : "Ownline Dropship"}.
        </p>
        <form onSubmit={(event) => void signIn(event)} className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              disabled={busy}
              className="h-10 rounded-md border border-input bg-card px-3"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Password
            <PasswordInput name="password" autoComplete="current-password" required disabled={busy} />
          </label>
          {signInError && (
            <p role="alert" className="text-sm text-(--tone-bad-fg)">
              {signInError}
            </p>
          )}
          <Button disabled={busy} type="submit">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        {role === "admin" && (
          <p className="mt-4 text-sm text-muted-foreground">
            <Link href="/admin/forgot-password" className="op-link">
              Forgot your password?
            </Link>
          </p>
        )}
      </div>
    );

  if (!actor) return null;
  return <>{children(actor)}</>;
}
