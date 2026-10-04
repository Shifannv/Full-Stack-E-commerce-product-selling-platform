"use client";

import { useEffect, useState } from "react";
import { authApi, ApiError } from "@/lib/api";
import { operatorWorkflows, runOperatorWorkflow, type OperatorWorkflow } from "@/lib/api/operator-workflows";
import { Button } from "@/components/ui/button";

export function OperatorGate({ role, children }: { role: "admin" | "super-admin"; children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "signed-out" | "allowed" | "forbidden" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active=true;
    authApi.me().then(actor => { if(active) setState(actor.roles.includes(role === "admin" ? "ADMIN" : "SUPER_ADMIN") ? "allowed" : "forbidden"); }).catch(reason => { if(active) { setState(reason instanceof ApiError && reason.status === 401 ? "signed-out" : "error"); setError(reason instanceof Error ? reason.message : "Account check unavailable"); }});
    return ()=>{active=false;};
  },[role,attempt]);
  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true); setError(null);
    try { await authApi.signIn(String(form.get("email")),String(form.get("password"))); setState("loading"); setAttempt(value=>value+1); }
    catch(reason) { setError(reason instanceof Error ? reason.message : "Sign-in unavailable"); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError(null);
    try { await authApi.signOut(); setState("signed-out"); }
    catch(reason) { setError(reason instanceof Error ? reason.message : "Sign-out unavailable"); }
    finally { setBusy(false); }
  }
  if(state === "loading") return <p role="status" className="py-12">Checking your workspace…</p>;
  if(state === "forbidden" || state === "error") return <div className="commerce-panel max-w-xl"><h1 className="type-section">{state === "forbidden" ? "This workspace needs another account" : "Workspace unavailable"}</h1><p className="mt-4 text-muted-foreground">{state === "forbidden" ? `Sign in with an authorized ${role === "admin" ? "seller" : "Super Admin"} account.` : error}</p><Button className="mt-6" disabled={busy} onClick={()=>void signOut()}>Sign out</Button><Button className="ml-2 mt-6" variant="outline" onClick={()=>{setState("loading");setAttempt(value=>value+1);}}>Try again</Button></div>;
  if(state === "signed-out") return <section className="commerce-panel max-w-xl"><h1 className="type-page">Your workspace</h1><p className="mt-4 text-muted-foreground">Sign in to manage {role === "admin" ? "your seller account" : "Ownline"}.</p><form className="workflow-form" onSubmit={event=>void signIn(event)}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</Button></form></section>;
  return <><div className="mb-6 flex items-center justify-end gap-4">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button variant="outline" disabled={busy} onClick={()=>void signOut()}>{busy ? "Signing out…" : "Sign out"}</Button></div>{children}</>;
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
  return <section id="operations" className="mt-12 scroll-mt-8 border-t border-border pt-10"><div className="store-page-heading"><div><h2 className="type-page">{role === "admin" ? "Manage your store" : "Manage Ownline"}</h2><p>Choose a workspace, review the records and make your next change.</p></div></div><div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Workspace sections">{groups.map(name=><Button key={name} variant={group===name ? "default" : "outline"} aria-pressed={group===name} onClick={()=>{setGroup(name);setSelected(workflows.find(workflow=>workflow.group===name)!.key);}}>{name}</Button>)}</div><div className="operator-workflow-layout"><nav aria-label={`${group} tasks`} className="operator-task-nav">{options.map(option=><button type="button" key={option.key} aria-current={workflow.key===option.key ? "true" : undefined} onClick={()=>setSelected(option.key)}>{option.label}</button>)}</nav><div className="commerce-panel min-w-0"><WorkflowForm key={workflow.key} workflow={workflow} /></div></div></section>;
}
