import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./app-env";
import { mutationOrigin } from "./middleware/mutation-origin";
import { registerRoutes } from "./routes";

export const app = new Hono<AppEnv>();

app.use("/api/*", cors({
  origin: (origin, c) => origin === c.env.FRONTEND_ORIGIN ? origin : undefined,
  credentials: true,
}));
app.use("/api/*", mutationOrigin);

registerRoutes(app);
