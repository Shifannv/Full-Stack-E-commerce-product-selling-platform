/**
 * local-db-guard.ts
 *
 * Safety boundary between local/test tooling and remote (Aiven) databases.
 *
 * Allowed local hosts (by default):
 *   localhost, 127.0.0.1, ::1, [::1]
 *
 * Everything else is considered remote and is refused unless the caller
 * has explicitly opted in with ALLOW_REMOTE_FIXTURES=1.
 *
 * Call assertLocalOrOptedIn() right after dotenv has loaded DATABASE_URL.
 */

/** Canonical set of hostnames that represent the local loopback interface. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Return true iff the supplied PostgreSQL URL targets a local loopback host.
 *
 * Exported so tests can verify the predicate directly without touching
 * process.env.
 *
 * @throws {Error} if rawUrl is not a syntactically valid URL.
 * @throws {Error} if the parsed URL contains a non-empty userinfo segment that
 *   does not match the normal postgres://user:pass@host pattern, which is the
 *   classic userinfo-spoof vector (e.g. postgres://attacker@real.host@local).
 *   The WHATWG URL parser handles this correctly — the host it extracts is the
 *   true host — so we verify it independently here.
 * @throws {Error} if the parsed URL has an empty hostname.
 */
export function isLocalHost(rawUrl: string): boolean {
  if (!rawUrl || rawUrl.trim() === "") {
    throw new Error("DATABASE_URL must not be empty");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: "${rawUrl}"`);
  }

  const host = parsed.hostname;

  // An empty hostname after parsing indicates a malformed or relative URL.
  if (!host || host.trim() === "") {
    throw new Error(`DATABASE_URL has an empty or missing hostname: "${rawUrl}"`);
  }

  // Userinfo spoof guard: detect raw "@" sequences in the authority beyond what
  // the URL parser exposes. The WHATWG URL parser already resolves these
  // correctly (the last "@" separates credentials from host), but we explicitly
  // reject them to prevent any future parser divergence from causing a bypass.
  // A legitimate postgres URL looks like postgres://user:pass@host/db.
  // An attacker might try postgres://user@remote-host@localhost/db in an attempt
  // to make a superficial string-match on "localhost" succeed.
  const authority = rawUrl.slice(parsed.protocol.length + 2).split("/")[0]; // strip scheme and path
  const atCount = (authority.match(/@/g) ?? []).length;
  if (atCount > 1) {
    throw new Error(
      `DATABASE_URL contains multiple "@" characters in the authority section — ` +
        `possible userinfo/URL spoof attempt: "${rawUrl}"`,
    );
  }

  return LOCAL_HOSTS.has(host);
}

/**
 * Assert that DATABASE_URL targets a local database, or that the caller has
 * explicitly opted in with ALLOW_REMOTE_FIXTURES=1.
 *
 * Scripts that write fixture rows (seed, bootstrap, verify-workflows,
 * verify-integrity, …) must call this immediately after loading env variables.
 *
 * Behaviour when DATABASE_URL is absent: the function returns without error so
 * each individual script can produce a more contextual "DATABASE_URL required"
 * message.  The caller must still check for the missing URL themselves.
 */
export function assertLocalOrOptedIn(scriptName: string): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) return; // each script already reports its own missing-URL error

  const remote = !isLocalHost(raw); // propagates parse/validation errors as-is

  if (remote && process.env.ALLOW_REMOTE_FIXTURES !== "1") {
    let host: string;
    try {
      host = new URL(raw).hostname;
    } catch {
      host = "<unparseable>";
    }
    throw new Error(
      `${scriptName} writes fixture rows and refuses to run against remote host "${host}". ` +
        "Use a local database, or set ALLOW_REMOTE_FIXTURES=1 to run it deliberately.",
    );
  }
}
