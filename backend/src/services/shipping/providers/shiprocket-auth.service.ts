export const SHIPROCKET_API_BASE_URL =
  "https://apiv2.shiprocket.in/v1/external";

const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function shiprocketBaseUrl(value: string | undefined): string {
  const candidate = (value || SHIPROCKET_API_BASE_URL).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Invalid Shiprocket API base URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "apiv2.shiprocket.in" ||
    url.port ||
    url.pathname !== "/v1/external" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid Shiprocket API base URL");
  }
  return url.toString().replace(/\/+$/, "");
}

function jwtExpiry(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: unknown };
    return typeof decoded.exp === "number" && Number.isFinite(decoded.exp)
      ? decoded.exp * 1000
      : undefined;
  } catch {
    return undefined;
  }
}

export class ShiprocketAuthService {
  private cached?: { value: string; expiresAt: number };
  private pending?: Promise<string>;
  private readonly baseUrl: string;

  constructor(
    private readonly email: string,
    private readonly password: string,
    private readonly fetcher: typeof fetch = fetch,
    baseUrl = SHIPROCKET_API_BASE_URL,
    private readonly now: () => number = Date.now,
  ) {
    this.baseUrl = shiprocketBaseUrl(baseUrl);
  }

  async getToken(): Promise<string> {
    if (!this.email.trim() || !this.password)
      throw new Error("Shiprocket API user credentials are required");
    if (this.cached && this.now() < this.cached.expiresAt)
      return this.cached.value;
    if (!this.pending) {
      this.pending = this.login().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  invalidateToken(value: string): void {
    if (this.cached?.value === value) this.cached = undefined;
  }

  private async login(): Promise<string> {
    const response = await this.fetcher(`${this.baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok)
      throw new Error(`Shiprocket authentication failed (${response.status})`);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Shiprocket authentication response is invalid");
    }
    const token =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).token
        : undefined;
    if (typeof token !== "string" || !token)
      throw new Error("Shiprocket authentication response is invalid");
    const issuedAt = this.now();
    const expiresAt = Math.min(
      issuedAt + 9 * DAY_MS,
      (jwtExpiry(token) ?? issuedAt + 10 * DAY_MS) - REFRESH_MARGIN_MS,
    );
    if (expiresAt <= issuedAt)
      throw new Error("Shiprocket authentication token has expired");
    this.cached = { value: token, expiresAt };
    return token;
  }
}
