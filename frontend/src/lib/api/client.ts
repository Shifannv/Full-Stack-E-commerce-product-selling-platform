// Browser-facing HTTP client. Eligibility, amounts, approval and permissions stay on the Worker.
const apiOrigin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
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
    throw new ApiError(response.status, message);
  }
  return payload as T;
}

export const id = (value: string) => encodeURIComponent(value);
export const json = (value: unknown) => JSON.stringify(value);
