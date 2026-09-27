import { betterAuth } from "better-auth";
import { authOptions } from "./src/lib/auth/options";

// The CLI reads this configuration to generate Better Auth's Drizzle tables.
export const auth = betterAuth(authOptions);
