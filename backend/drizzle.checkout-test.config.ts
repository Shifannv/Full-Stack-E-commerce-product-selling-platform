import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load the normal environment only to reject an accidental match. The sole
// connection used by this configuration is CHECKOUT_TEST_DATABASE_URL.
config({ path: ".env.checkout-test.local", quiet: true });
config({ path: ".env", quiet: true });
const testUrl = process.env.CHECKOUT_TEST_DATABASE_URL;
if (!testUrl) throw new Error("CHECKOUT_TEST_DATABASE_URL is required");
const test = new URL(testUrl);
if (!["postgres:", "postgresql:"].includes(test.protocol)) throw new Error("CHECKOUT_TEST_DATABASE_URL must be PostgreSQL");
if (test.hostname !== "127.0.0.1" || test.port !== "5432" || test.pathname !== "/ownline_checkout_test" || decodeURIComponent(test.username) !== "postgres") {
  throw new Error("Checkout migration target must be postgres@127.0.0.1:5432/ownline_checkout_test");
}
if (process.env.DATABASE_URL) {
  const configured = new URL(process.env.DATABASE_URL);
  if (test.hostname === configured.hostname && test.port === configured.port && test.pathname === configured.pathname) {
    throw new Error("Checkout test database must differ from configured DATABASE_URL");
  }
}
test.searchParams.set("uselibpqcompat", "true");

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: test.toString() },
});
