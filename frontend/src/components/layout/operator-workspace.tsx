"use client";

import { useEffect, useState } from "react";
import { authApi, ApiError } from "@/lib/api";
import { operatorWorkflows, runOperatorWorkflow, type OperatorWorkflow } from "@/lib/api/operator-workflows";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { api as apiCall, json } from "@/lib/api/client";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

export function OperatorGate({ role, children }: { role: "admin" | "super-admin"; children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "signed-out" | "allowed" | "forbidden" | "error" | "must-change-password">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    authApi.me().then(actor => {
      if (!active) return;
      // Forced password change takes precedence for Admin role only.
      if (actor.mustChangePassword && role === "admin") {
        setState("must-change-password");
        return;
      }
      setState(actor.roles.includes(role === "admin" ? "ADMIN" : "SUPER_ADMIN") ? "allowed" : "forbidden");
    }).catch(reason => {
      if (!active) return;
      setState(reason instanceof ApiError && reason.status === 401 ? "signed-out" : "error");
      setError(reason instanceof Error ? reason.message : "Account check unavailable");
    });
    return () => { active = false; };
  }, [role, attempt]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      await authApi.signIn(String(form.get("email")), String(form.get("password")));
      setState("loading");
      setAttempt(value => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in unavailable");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true); setError(null);
    try {
      await authApi.signOut();
      setState("signed-out");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-out unavailable");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <p role="status" className="py-12">Checking your workspace…</p>;

  if (state === "forbidden" || state === "error") return (
    <div className="commerce-panel max-w-xl">
      <h1 className="type-section">{state === "forbidden" ? "This workspace needs another account" : "Workspace unavailable"}</h1>
      <p className="mt-4 text-muted-foreground">
        {state === "forbidden" ? `Sign in with an authorized ${role === "admin" ? "seller" : "Super Admin"} account.` : error}
      </p>
      <Button className="mt-6" disabled={busy} onClick={() => void signOut()}>Sign out</Button>
      <Button className="ml-2 mt-6" variant="outline" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>Try again</Button>
    </div>
  );

  if (state === "must-change-password") return (
    <InitialPasswordChange
      onDone={() => { setState("loading"); setAttempt(v => v + 1); }}
      onSignOut={() => void signOut()}
    />
  );

  if (state === "signed-out") return (
    <section className="commerce-panel max-w-xl">
      <h1 className="type-page">Your workspace</h1>
      <p className="mt-4 text-muted-foreground">Sign in to manage {role === "admin" ? "your seller account" : "Ownline Dropship"}.</p>
      <form className="workflow-form" onSubmit={event => void signIn(event)}>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<PasswordInput name="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      {role === "admin" && (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link href="/admin/forgot-password" className="text-primary underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
        </p>
      )}
    </section>
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-end gap-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button variant="outline" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</Button>
      </div>
      {children}
    </>
  );
}

/**
 * Forced-password-change form for newly-provisioned Admins with mustChangePassword = true.
 *
 * POST /api/admin/account/initial-password
 * Backend requirements:
 *   - currentPassword: the temporary password provided by the Super Admin
 *   - newPassword: 12–128 characters, different from currentPassword
 * Backend response:
 *   - { mustChangePassword: false, signInRequired: true }
 *   - All existing sessions are deleted.
 *
 * SECURITY:
 * - Never displays the temporary password.
 * - Password policy matches backend: 12–128 chars, new !== current.
 * - Handles 403 (wrong current password) and 409 (already changed) separately.
 */
export function InitialPasswordChange({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (newPassword.length < MIN_PASSWORD_LENGTH) { setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (newPassword.length > MAX_PASSWORD_LENGTH) { setError(`New password must not exceed ${MAX_PASSWORD_LENGTH} characters.`); return; }
    if (newPassword !== confirm) { setError("New passwords do not match."); return; }
    if (currentPassword === newPassword) { setError("Choose a different permanent password (not the same as the temporary one)."); return; }

    setBusy(true); setError(null);
    try {
      await apiCall<{ mustChangePassword: boolean; signInRequired: boolean }>(
        "/api/admin/account/initial-password",
        { method: "POST", body: json({ currentPassword, newPassword }) }
      );
      setDone(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 403) {
        setError("Current password is incorrect. Enter the temporary password provided by your administrator.");
      } else if (reason instanceof ApiError && reason.status === 409) {
        setError("This password has already been changed. Sign out and sign in with your permanent password.");
      } else {
        setError(reason instanceof Error ? reason.message : "Password change failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (done) return (
    <section className="commerce-panel max-w-xl">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <svg aria-hidden="true" className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Your permanent password has been set. All existing sessions have been signed out for security.
          Sign in with your new password to continue.
        </p>
        <Button className="mt-6 w-full" onClick={onDone}>Continue to sign in</Button>
      </div>
    </section>
  );

  return (
    <section className="commerce-panel max-w-xl">
      <div className="rounded-xl border border-border bg-card p-8">
        <h1 className="text-xl font-semibold tracking-tight">Set a permanent password</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Your account was provisioned with a temporary password. You must set a permanent password before you can continue.
          Enter the temporary password you received, then choose a new permanent password.
        </p>

        <form onSubmit={event => void handleSubmit(event)} className="mt-7 space-y-5" noValidate>
          <label className="block">
            <span className="block text-sm font-medium mb-2">Current (temporary) password</span>
            <PasswordInput
              id="admin-initial-password-current"
              name="currentPassword"
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium mb-2">New password</span>
            <PasswordInput
              id="admin-initial-password-new"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              disabled={busy}
              placeholder={`${MIN_PASSWORD_LENGTH}+ characters`}
            />
            <span className="mt-1 block text-xs text-muted-foreground">Minimum {MIN_PASSWORD_LENGTH} characters, maximum {MAX_PASSWORD_LENGTH}.</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium mb-2">Confirm new password</span>
            <PasswordInput
              id="admin-initial-password-confirm"
              name="confirm"
              autoComplete="new-password"
              required
              disabled={busy}
              placeholder="Re-enter new password"
            />
          </label>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <Button id="admin-initial-password-submit" type="submit" disabled={busy} className="w-full">
            {busy ? "Setting password…" : "Set permanent password"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button type="button" onClick={onSignOut} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </section>
  );
}

function label(key: string) { return key.replace(/([a-z])([A-Z])/g,"$1 $2").replaceAll("_"," "); }
export function OperatorData({ value, depth=0 }: { value: unknown; depth?: number }) {
  if(value === null || value === undefined) return <span className="text-muted-foreground">Not recorded</span>;
  if(typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if(typeof value !== "object") return <span className="break-words [overflow-wrap:anywhere]">{String(value)}</span>;
  if(depth>6) return <span>Further details available in the record.</span>;
  if(Array.isArray(value)) return value.length ? <ol className="space-y-5">{value.map((item,index)=><li className="border-b border-border pb-4" key={index}><OperatorData value={item} depth={depth+1} /></li>)}</ol> : <p className="text-muted-foreground">No records found.</p>;
  return <dl className="space-y-3">{Object.entries(value).filter(([key])=>!/(password|secret|token|authorization|setupUrl|invitationUrl)/i.test(key)).map(([key,content])=><div key={key} className={content && typeof content === "object" ? "space-y-2" : "grid grid-cols-[minmax(6rem,1fr)_minmax(0,2fr)] gap-4"}><dt className="text-sm capitalize text-muted-foreground">{label(key)}</dt><dd className="min-w-0 text-sm"><OperatorData value={content} depth={depth+1} /></dd></div>)}</dl>;
}

function WorkflowForm({ workflow }: { workflow: OperatorWorkflow }) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [result,setResult]=useState<unknown>(undefined);
  const [review,setReview]=useState<FormData|null>(null);
  async function run(form: FormData) {
    setBusy(true); setError(null); setResult(undefined);
    try { setResult(await runOperatorWorkflow(workflow,form)); setReview(null); }
    catch(reason) { setError(reason instanceof Error ? reason.message : "This operation could not be completed. Try again."); }
    finally { setBusy(false); }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget);
    if(workflow.method === "GET") void run(form);
    else { setError(null); setResult(undefined); setReview(form); }
  }
  return <div className="min-w-0"><h3 className="type-section">{workflow.label}</h3>{workflow.description && <p className="mt-4 max-w-prose text-sm text-muted-foreground">{workflow.description}</p>}
    {workflow.blocked ? <p role="status" className="mt-6 border-y border-border py-6 text-sm text-muted-foreground">{workflow.blocked}</p> : <form onSubmit={submit} className="workflow-form">
      <fieldset disabled={busy || !!review} className="grid gap-4">{workflow.fields.map(field=><label key={field.name}>{field.label}{field.optional ? " (optional)" : ""}
        {field.options || field.kind === "boolean" ? <select name={field.name} required={!field.optional} defaultValue=""><option value="" disabled={!field.optional}>Choose…</option>{(field.options ?? ["true","false"]).map(option=><option key={option} value={option}>{option === "true" ? "Yes" : option === "false" ? "No" : option.replaceAll("_"," ")}</option>)}</select>
          : ["textarea","attributes","list"].includes(field.kind ?? "") ? <textarea name={field.name} required={!field.optional} maxLength={field.kind === "attributes" ? 12000 : 5000} />
          : <input name={field.name} type={field.kind === "number" || field.kind === "decimal" ? "number" : field.kind === "file" ? "file" : field.kind === "password" ? "password" : field.name === "email" ? "email" : "text"} required={!field.optional} min={field.min} max={field.max} step={field.step ?? (field.kind === "number" ? "1" : undefined)} accept={field.accept} autoComplete={field.kind === "password" ? "current-password" : undefined} />}
      </label>)}</fieldset>
      {!review && <Button type="submit" disabled={busy}>{busy ? "Working…" : workflow.download ? "Download document" : workflow.method === "GET" ? "Load records" : "Review changes"}</Button>}
    </form>}
    {review && <div className="mt-6 border-t border-border pt-6"><h4 className="font-medium">Review before submitting</h4><dl className="mt-4 space-y-3 text-sm">{workflow.fields.map(field=>{const value=review.get(field.name);return <div key={field.name}><dt className="text-muted-foreground">{field.label}</dt><dd className="break-words whitespace-pre-wrap">{field.kind === "password" ? "Password entered" : value instanceof File ? value.name : String(value || "Not changed")}</dd></div>;})}</dl><p className="mt-4 text-sm text-muted-foreground">{workflow.label} will update the selected records. Eligibility and permissions are checked by the store.</p><div className="mt-5 flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>void run(review)}>{busy ? "Submitting…" : "Confirm changes"}</Button><Button disabled={busy} variant="ghost" onClick={()=>setReview(null)}>Back to edit</Button></div></div>}
    {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
    {result !== undefined && <section className="mt-8 border-t border-border pt-6" aria-live="polite"><h4 className="mb-5 font-medium">{workflow.method === "GET" ? "Records" : "Operation completed"}</h4><OperatorData value={result} /></section>}
  </div>;
}

export function OperatorWorkspace({ role }: { role: "admin" | "super-admin" }) {
  const workflows=operatorWorkflows.filter(workflow=>workflow.role===role);
  const groups=[...new Set(workflows.map(workflow=>workflow.group))];
  const [group,setGroup]=useState(groups[0]);
  const options=workflows.filter(workflow=>workflow.group===group);
  const [selected,setSelected]=useState(workflows[0].key);
  const workflow=options.find(workflow=>workflow.key===selected) ?? options[0];
  return <section id="operations" className="mt-12 scroll-mt-8 border-t border-border pt-10"><div className="store-page-heading"><div><h2 className="type-page">{role === "admin" ? "Manage your store" : "Manage Ownline Dropship"}</h2><p>Choose a workspace, review the records and make your next change.</p></div></div><div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Workspace sections">{groups.map(name=><Button key={name} variant={group===name ? "default" : "outline"} aria-pressed={group===name} onClick={()=>{setGroup(name);setSelected(workflows.find(workflow=>workflow.group===name)!.key);}}>{name}</Button>)}</div><div className="operator-workflow-layout"><nav aria-label={`${group} tasks`} className="operator-task-nav">{options.map(option=><button type="button" key={option.key} aria-current={workflow.key===option.key ? "true" : undefined} onClick={()=>setSelected(option.key)}>{option.label}</button>)}</nav><div className="commerce-panel min-w-0"><WorkflowForm key={workflow.key} workflow={workflow} /></div></div></section>;
}
