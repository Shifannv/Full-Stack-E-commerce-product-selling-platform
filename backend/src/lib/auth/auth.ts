import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { eq } from "drizzle-orm";
import { createDb } from "../../db";
import * as schema from "../../db/schema/auth";
import { roles, userRoles } from "../../db/schema/rbac";
import { authOptions } from "./options";

export type AuthBindings = {
  /** Dedicated base64 32-byte AES key for private seller bank details. */
  ADMIN_BANK_ENCRYPTION_KEY?: string;
  HYPERDRIVE: { connectionString: string };
  KYC_BUCKET?: {
    put: (
      key: string,
      value: ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>;
    get: (key: string) => Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
    } | null>;
    delete: (key: string) => Promise<void>;
  };
  PRODUCT_IMAGES_BUCKET?: {
    get: (key: string) => Promise<{
      body: ReadableStream;
      httpMetadata?: { contentType?: string };
    } | null>;
    put: (
      key: string,
      value: ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) => Promise<unknown>;
    head: (key: string) => Promise<unknown | null>;
    delete: (key: string) => Promise<void>;
  };
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  FRONTEND_ORIGIN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /**
   * Direct Worker origin used for server-to-server callbacks that must reach
   * the Worker without the Pages proxy (e.g. Cashfree `notify_url`). Optional:
   * when unset it falls back to BETTER_AUTH_URL, which is correct in dev where
   * both resolve to the same loopback origin. In production BETTER_AUTH_URL
   * becomes the Pages origin for same-origin cookies, so PUBLIC_WORKER_URL
   * must be set to the Worker's own URL.
   */
  PUBLIC_WORKER_URL?: string;
  /** Resend API key for transactional email (invitations, password reset). */
  RESEND_API_KEY?: string;
  /** Verified sender address configured in Resend dashboard. */
  RESEND_FROM_EMAIL?: string;
  /**
   * Full URL of the frontend password-reset page, e.g.
   * https://ownlinedropship.com/reset-password  (production)
   * http://127.0.0.1:3000/reset-password        (local dev)
   * When unset, falls back to FRONTEND_ORIGIN + "/reset-password".
   */
  PASSWORD_RESET_URL?: string;
};

export function createAuth(env: AuthBindings) {
  if (
    !env.BETTER_AUTH_SECRET ||
    !env.BETTER_AUTH_URL ||
    !env.FRONTEND_ORIGIN ||
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET
  ) {
    throw new Error("Authentication configuration is incomplete");
  }

  const { client, db } = createDb(env.HYPERDRIVE.connectionString);
  const auth = betterAuth({
    ...authOptions,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.FRONTEND_ORIGIN],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await db
              .insert(roles)
              .values({ name: "CUSTOMER" })
              .onConflictDoNothing();
            const [customerRole] = await db
              .select({ id: roles.id })
              .from(roles)
              .where(eq(roles.name, "CUSTOMER"))
              .limit(1);
            if (!customerRole) throw new Error("Customer role is unavailable");
            await db
              .insert(userRoles)
              .values({ userId: user.id, roleId: customerRole.id })
              .onConflictDoNothing();
          },
        },
      },
    },
  });

  return { auth, client, db };
}
