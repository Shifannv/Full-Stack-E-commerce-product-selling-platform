import { createMiddleware } from "hono/factory";
import type { AuthorizedEnv } from "./authorization";

export const isMutation = (method: string) =>
  ["POST", "PUT", "PATCH", "DELETE"].includes(method);

function origin(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

// Applied to every custom API mutation, including activation. Better Auth owns
// its own origin checks. Provider routes live outside /api and use signatures.
export const mutationOrigin = createMiddleware<AuthorizedEnv>(
  async (c, next) => {
    if (!isMutation(c.req.method) || c.req.path.startsWith("/api/auth/"))
      return next();
    const supplied = c.req.header("origin");
    const candidate =
      supplied !== undefined
        ? origin(supplied)
        : origin(c.req.header("referer") ?? "");
    const trusted = [
      origin(c.env.FRONTEND_ORIGIN),
      origin(c.env.BETTER_AUTH_URL),
    ].filter(Boolean);
    if (
      !candidate ||
      !trusted.includes(candidate) ||
      (supplied !== undefined && supplied !== candidate)
    ) {
      return c.json({ error: "Untrusted mutation origin" }, 403);
    }
    await next();
  },
);
