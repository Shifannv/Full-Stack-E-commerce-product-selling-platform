import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { ShiprocketAuthService } from "../src/services/shipping/providers/shiprocket-auth.service";

async function main() {
  const source = readFileSync(".dev.vars", "utf8");
  const vars = parse(source);
  const email = vars.SHIPROCKET_API_EMAIL;
  const password = vars.SHIPROCKET_API_PASSWORD;
  if (!email || !password) throw new Error("Shiprocket Worker credentials are missing");
  const passwordLine = source.split(/\r?\n/).find((line) => /^\s*SHIPROCKET_API_PASSWORD\s*=/.test(line));
  const literal = passwordLine?.slice(passwordLine.indexOf("=") + 1).trim();
  if (!literal?.startsWith('"') || !literal.endsWith('"') || password !== literal.slice(1, -1)) throw new Error("Shiprocket password must be quoted intact in .dev.vars");
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (!response.ok) console.error("Shiprocket HTTP response", { status: response.status, contentType: response.headers.get("content-type"), server: response.headers.get("server") });
    return response;
  };
  const token = await new ShiprocketAuthService(email, password, diagnosticFetch, vars.SHIPROCKET_API_BASE_URL).getToken();
  if (!token) throw new Error("Shiprocket returned no token");
  console.log("Shiprocket authentication: PASS; token received and withheld");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const safeReason = /^(Shiprocket (authentication failed \(\d+\)|authentication response is invalid|authentication token has expired|API user credentials are required)|Invalid Shiprocket API base URL)$/.test(message)
    ? message : "Network or runtime failure";
  console.error("Shiprocket authentication: FAIL", { reason: safeReason, code: (error as { cause?: { code?: string } } | null)?.cause?.code });
  process.exitCode = 1;
});
