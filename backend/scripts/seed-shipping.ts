import { config } from "dotenv";
import { createDb } from "../src/db";
import { shippingProviderConfigs } from "../src/db/schema/shipping";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
async function main() {
  const { client, db } = createDb(process.env.DATABASE_URL!);
  try {
    await db.insert(shippingProviderConfigs).values({ providerKey: "shiprocket", displayName: "Shiprocket", enabled: false, capabilities: ["FORWARD_SHIPMENT", "TRACKING", "SERVICEABILITY"] }).onConflictDoNothing();
    console.log("Shipping provider metadata is ready (activation remains a separate decision)");
  } finally {
    await client.end({ timeout: 1 });
  }
}
main().catch((error: unknown) => {
  console.error("Shipping seed failed", { name: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string } | null)?.code });
  process.exitCode = 1;
});
