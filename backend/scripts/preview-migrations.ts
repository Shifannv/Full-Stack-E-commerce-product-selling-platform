import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const drizzleDir = fileURLToPath(new URL("../drizzle", import.meta.url));

type JournalEntry = { idx: number; when: number; tag: string };
const journal = JSON.parse(
  readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8"),
) as { entries: JournalEntry[] };

const client = postgres(process.env.DATABASE_URL, { max: 1 });
const ROLLBACK = new Error("PREVIEW_ROLLBACK");

// Uses the same ordering rule as drizzle-kit: a migration is pending when its
// journal timestamp is newer than the newest applied record.
async function main() {
  const [applied] =
    await client`select coalesce(max(created_at), 0)::bigint as latest from drizzle.__drizzle_migrations`;
  const latest = Number(applied.latest);
  const pending = journal.entries
    .filter((entry) => Number(entry.when) > latest)
    .sort((a, b) => a.when - b.when);

  if (pending.length === 0) {
    console.log("Database is up to date - no pending migrations.");
    return;
  }

  console.log("Pending migrations: " + pending.length);
  for (const entry of pending) console.log("  " + entry.tag);

  const failures: string[] = [];
  let statements = 0;
  try {
    await client.begin(async (tx) => {
      for (const entry of pending) {
        const file = entry.tag + ".sql";
        const contents = readFileSync(join(drizzleDir, file), "utf8");
        for (const part of contents.split("--> statement-breakpoint")) {
          const sql = part.trim();
          if (!sql) continue;
          statements += 1;
          try {
            await tx.unsafe(sql);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            failures.push(
              file +
                " :: " +
                message +
                " :: " +
                sql.replace(/\s+/g, " ").slice(0, 140),
            );
            throw ROLLBACK;
          }
        }
        console.log("  applied  " + file);
      }
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }

  console.log("");
  console.log("statements=" + statements + " failures=" + failures.length);
  for (const line of failures) console.log("  FAIL " + line);
  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(
    "Preview applied cleanly against the live schema and was rolled back. Run 'npm run migrate' to commit.",
  );
}

main()
  .catch((error) => {
    console.error("Migration preview failed", error);
    process.exitCode = 1;
  })
  .finally(() => client.end({ timeout: 1 }));
