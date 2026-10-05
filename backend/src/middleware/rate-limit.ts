import { sql } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { createDb } from "../db";
import type { AuthorizedEnv } from "./authorization";
import { isMutation } from "./mutation-origin";

export function mutationRatePolicy(path: string, method: string) {
  if (path === "/api/admin/activate")
    return { group: "activation", limit: 10, seconds: 600 };
  if (!isMutation(method)) return null;
  if (/\/account\/(deletion-requests|recovery-requests|initial-password)/.test(path))
    return { group: "account", limit: 10, seconds: 600 };
  if (/\/review\/(invite|reinvite|provision)$/.test(path))
    return { group: "invitation", limit: 10, seconds: 600 };
  if (/^\/api\/(admin|super-admin)\//.test(path))
    return { group: "privileged", limit: 60, seconds: 60 };
  if (/^\/api\/(checkout|orders(?:\/|$)|returns(?:\/|$))/.test(path))
    return { group: "commerce", limit: 20, seconds: 60 };
  // Note: /api/auth/forgot-password uses group "pwd-reset" consumed inline
  // in password-reset.routes.ts because it is always IP-keyed (no actor).
  return null;
}

export async function consumeMutationLimit(
  db: ReturnType<typeof createDb>["db"],
  identity: string,
  policy: NonNullable<ReturnType<typeof mutationRatePolicy>>,
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity),
  );
  const key = `v1:${policy.group}:${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  return db.transaction(async (tx) => {
    // Bound opportunistic cleanup; SKIP LOCKED avoids contention with counters.
    await tx.execute(sql`delete from api_rate_limits where key in
      (select key from api_rate_limits where expires_at < statement_timestamp() - interval '1 day'
       order by expires_at limit 100 for update skip locked)`);
    const rows =
      await tx.execute(sql`insert into api_rate_limits (key, count, expires_at)
      values (${key}, 1, statement_timestamp() + ${policy.seconds} * interval '1 second')
      on conflict (key) do update set
        count = case when api_rate_limits.expires_at <= statement_timestamp() then 1 else least(api_rate_limits.count + 1, ${policy.limit + 1}) end,
        expires_at = case when api_rate_limits.expires_at <= statement_timestamp() then statement_timestamp() + ${policy.seconds} * interval '1 second' else api_rate_limits.expires_at end
      returning count, greatest(1, ceil(extract(epoch from expires_at - statement_timestamp()))) as retry_after`);
    return {
      allowed: Number(rows[0].count) <= policy.limit,
      retryAfter: Number(rows[0].retry_after),
    };
  });
}

export const mutationRateLimit = createMiddleware<AuthorizedEnv>(
  async (c, next) => {
    if (c.get("mutationRateChecked")) return next();
    const policy = mutationRatePolicy(c.req.path, c.req.method);
    if (!policy) return next();
    // CF sets this header at the Worker edge. No X-Forwarded-For trust.
    // Local activation without CF metadata uses a shared unknown-IP bucket.
    const identity =
      c.get("actor")?.userId ??
      `ip:${c.req.header("cf-connecting-ip") ?? "unknown"}`;
    let client: ReturnType<typeof createDb>["client"] | undefined;
    try {
      const connection = createDb(c.env.HYPERDRIVE.connectionString);
      client = connection.client;
      const result = await consumeMutationLimit(
        connection.db,
        identity,
        policy,
      );
      if (!result.allowed) {
        c.header("Retry-After", String(result.retryAfter));
        return c.json({ error: "Too many requests" }, 429);
      }
      c.set("mutationRateChecked", true);
    } catch {
      c.header("Retry-After", "5");
      return c.json({ error: "Request protection unavailable" }, 503);
    } finally {
      await client?.end({ timeout: 1 }).catch(() => undefined);
    }
    await next();
  },
);
