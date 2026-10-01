import { createAuth } from "../../lib/auth/auth";
import { requireAuth } from "../../middleware/authorization";
import type { App } from "../../app-env";

/** Better Auth handler (/api/auth/*). */
export function registerAuthHandler(app: App) {
  app.all("/api/auth/*", async (c) => {
    let client: ReturnType<typeof createAuth>["client"] | undefined;
    try {
      const connection = createAuth(c.env);
      client = connection.client;
      return await connection.auth.handler(c.req.raw);
    } catch (error) {
      console.error("Authentication request failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: (error as { code?: string } | null)?.code,
      });
      return c.json({ error: "Authentication unavailable" }, 503);
    } finally {
      await client?.end({ timeout: 1 }).catch(() => undefined);
    }
  });
}

/** Current actor (/api/me). */
export function registerSessionRoute(app: App) {
  app.get("/api/me", requireAuth, (c) => c.json(c.get("actor")));
}
