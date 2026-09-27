import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 5,
    fetch_types: false,
    prepare: true,
  });

  return { client, db: drizzle(client) };
}
