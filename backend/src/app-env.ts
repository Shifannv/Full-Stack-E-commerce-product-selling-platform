import type { Hono } from "hono";
import type { AuthBindings } from "./lib/auth/auth";
import type { Actor } from "./middleware/authorization";

export type AppEnv = { Bindings: AuthBindings; Variables: { actor: Actor } };
export type App = Hono<AppEnv>;
