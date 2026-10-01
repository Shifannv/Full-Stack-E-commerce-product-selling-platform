/**
 * Same-origin API proxy for Cloudflare Pages.
 *
 * Browser hits   https://<pages>/api/*
 * This Function  → fetches https://<worker>/api/*
 *
 * The purpose is strictly cookie scope: Better Auth defaults to
 * `SameSite=Lax`, which browsers refuse to attach to cross-site
 * subresource fetches. Serving the API under the Pages origin makes
 * the session cookie first-party, so Lax covers all authenticated
 * requests on Safari and Firefox, not just Chrome.
 *
 * Rules:
 *   - target origin is fixed by the `PUBLIC_WORKER_URL` env var; no
 *     path or host from the request is used to compute it.
 *   - the inbound `Origin` header is forwarded verbatim so the
 *     Worker's mutation-origin middleware (which expects exactly
 *     FRONTEND_ORIGIN, i.e. the Pages origin) still sees a trusted
 *     origin.
 *   - redirects are passed through to the browser (`redirect:
 *     "manual"`) so Better Auth's OAuth 302 to Google is not
 *     silently followed inside this Function.
 *   - the response is re-emitted via `new Response(body, response)`
 *     so `Set-Cookie`, `Content-Type`, status and statusText reach
 *     the client exactly as the Worker emitted them.
 */

type Env = { PUBLIC_WORKER_URL?: string };

// Minimal Cloudflare Pages Function context type. The upstream
// @cloudflare/workers-types package provides a richer PagesFunction<Env>
// generic; this local alias avoids adding a dev dependency just for a
// single proxy file.
type Context = {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil(promise: Promise<unknown>): void;
  next(input?: Request | string, init?: RequestInit): Promise<Response>;
  data: Record<string, unknown>;
};

const unavailable = (message: string, status = 503) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });

export const onRequest = async (ctx: Context): Promise<Response> => {
  const configured = ctx.env.PUBLIC_WORKER_URL;
  if (!configured) return unavailable("API proxy is not configured");

  let targetOrigin: string;
  try {
    const parsed = new URL(configured);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error("invalid proxy target");
    }
    targetOrigin = parsed.origin;
  } catch {
    return unavailable("API proxy target is invalid");
  }

  const incoming = new URL(ctx.request.url);
  const forwarded = targetOrigin + incoming.pathname + incoming.search;

  // new Request(url, existingRequest) preserves the method, headers,
  // body stream, and credentials of the inbound request. The Origin
  // header is part of those headers and is forwarded verbatim.
  const proxied = new Request(forwarded, ctx.request);

  // redirect: "manual" is required so Better Auth's OAuth sign-in 302
  // to Google is relayed to the browser instead of followed inside the
  // Pages runtime.
  const response = await fetch(proxied, { redirect: "manual" });

  // Rewrap so the response is mutable in the Pages runtime; this
  // keeps Set-Cookie, Content-Type, Cache-Control and the status
  // line intact.
  return new Response(response.body, response);
};
