// Worker entrypoint (wrangler.jsonc `main`). Composition lives in app.ts; cron work in scheduler.ts.
import { app } from "./app";
import { scheduled } from "./scheduler";

export { app };

export default {
  fetch: app.fetch,
  scheduled,
};
