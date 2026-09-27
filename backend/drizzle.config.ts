import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle tooling");
}

let toolingUrl: URL;
try {
  toolingUrl = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
}
if (!["postgres:", "postgresql:"].includes(toolingUrl.protocol)) {
  throw new Error("DATABASE_URL must be a PostgreSQL URL");
}
// pg otherwise treats sslmode=require as verify-full; Aiven's require mode uses TLS without CA verification.
toolingUrl.searchParams.set("uselibpqcompat", "true");

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: toolingUrl.toString(),
  },
});
