import { createDb } from "../../db";
import { type AuthorizedEnv } from "../../middleware/authorization";
import { DomainError } from "../../services/admin/admin.service";
import { invitationSetupUrl } from "../../services/admin/invitation-url";
import type { Hono } from "hono";

export type AdminEnv = AuthorizedEnv & {
  Bindings: AuthorizedEnv["Bindings"] & {
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    ADMIN_SETUP_URL?: string;
  };
};
export type AdminRouter = Hono<AdminEnv>;

export async function withDb<T>(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<T>): Promise<T> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } finally { await client.end({ timeout: 1 }); }
}

export async function withDbPublic(connectionString: string, action: (db: ReturnType<typeof createDb>["db"]) => Promise<Response>, c: { json: (body: unknown, status?: number) => Response }): Promise<Response> {
  const { client, db } = createDb(connectionString);
  try { return await action(db); } catch (error) {
    if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
    console.error("Activation request failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return c.json({ error: "Activation unavailable" }, 503);
  } finally { await client.end({ timeout: 1 }); }
}

export async function bodyPublic(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid JSON body", 422);
  return value as Record<string, unknown>;
}

export function ownAdmin(actor: { roles: string[] }) {
  if (!actor.roles.includes("ADMIN")) throw new DomainError("Forbidden", 403);
}
export function superAdmin(actor: { roles: string[] }) {
  if (!actor.roles.includes("SUPER_ADMIN")) throw new DomainError("Forbidden", 403);
}
export function requireSetupUrl(value: string | undefined): string {
  if (!value) throw new DomainError("Admin invitation delivery is not configured", 409);
  try { return invitationSetupUrl(value).toString(); }
  catch { throw new DomainError("Admin setup URL must use HTTPS or the exact local development origin", 409); }
}
export async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const value = await c.req.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DomainError("Invalid JSON body", 422);
  return value as Record<string, unknown>;
}