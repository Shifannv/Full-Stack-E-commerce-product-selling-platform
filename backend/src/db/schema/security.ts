import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("api_rate_limits_expiry_idx").on(table.expiresAt)],
);
