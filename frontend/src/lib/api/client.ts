// Browser-facing HTTP client. Eligibility, amounts, approval and permissions stay on the Worker.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Seconds from a `Retry-After` response header, when the server supplied one. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiOrigin) throw new Error("NEXT_PUBLIC_API_URL is required");
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  const response = await fetch(new URL(path, apiOrigin), {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `API request failed (${response.status})`;
    throw new ApiError(response.status, message, retryAfterSeconds(response));
  }
  return payload as T;
}

// Rate limiting (middleware/rate-limit.ts) and limiter outages both send `Retry-After`.
function retryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

export const id = (value: string) => encodeURIComponent(value);
export const json = (value: unknown) => JSON.stringify(value);
