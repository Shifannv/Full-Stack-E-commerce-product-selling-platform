"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { authClient } from "@/lib/auth-client";
import { useCustomerSession } from "@/lib/use-customer-session";

export function GoogleSignInButton({ label = "Continue with Google" }: { label?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function signIn() {
    setPending(true); setError(null);
    try { const result = await authClient.signIn.social({ provider: "google", callbackURL: `${window.location.origin}/account` }); if (result.error) setError(result.error.message ?? "Google sign-in is unavailable"); }
    catch { setError("Google sign-in is unavailable"); }
    finally { setPending(false); }
  }
  return <div><Button disabled={pending} onClick={() => void signIn()}>{pending ? "Connecting…" : label}</Button>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}</div>;
}

export function CustomerGate({ children }: { children: React.ReactNode }) {
  const { status } = useCustomerSession();
  if (status === "loading" || status === "checking") return <LoadingState label="Checking your session" />;
  if (status === "signed-out") return <div className="rounded-xl border border-border bg-card px-6 py-12 text-center"><h2 className="type-section">Sign in to continue</h2><p className="mx-auto mt-3 max-w-md text-muted-foreground">Use your Google account to see your saved items and orders.</p><div className="mt-7"><GoogleSignInButton /></div></div>;
  if (status === "forbidden") return <ErrorState title="Customer account required" description="This area is available to customer accounts." />;
  if (status === "error") return <ErrorState title="Session unavailable" description="We could not check your account. Refresh the page and try again." />;
  return children;
}
