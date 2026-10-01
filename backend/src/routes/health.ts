import { sql } from "drizzle-orm";
import { createDb } from "../db";
import type { App } from "../app-env";

export function registerHealthRoutes(app: App) {
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
    });
  });

  app.get("/health/db", async (c) => {
    let client: ReturnType<typeof createDb>["client"] | undefined;
    try {
      const connection = createDb(c.env.HYPERDRIVE.connectionString);
      client = connection.client;
      const { db } = connection;
      const result = await db.execute(sql`SELECT 1 AS ok`);

      return c.json({
        status: "ok",
        database: "connected",
        result: result[0],
      });
    } catch (error) {
      // Driver errors can contain connection details. Log only safe diagnostics.
      console.error("Database health check failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        code: (error as { code?: string } | null)?.code,
      });

      return c.json(
        {
          status: "error",
          database: "disconnected",
        },
        500,
      );
    } finally {
      await client?.end({ timeout: 1 }).catch(() => undefined);
    }
  });
}
