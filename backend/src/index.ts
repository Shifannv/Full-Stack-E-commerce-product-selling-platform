import { Hono } from "hono";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";

type Bindings = {
  HYPERDRIVE: {
    connectionString: string;
  };
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
  });
});

app.get("/health/db", async (c) => {
  const client = postgres(c.env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
  });

  try {
    const db = drizzle(client);
    const result = await db.execute(sql`SELECT 1 AS ok`);

    return c.json({
      status: "ok",
      database: "connected",
      result: result[0],
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return c.json(
      {
        status: "error",
        database: "disconnected",
      },
      500,
    );
  }
});

export default app;