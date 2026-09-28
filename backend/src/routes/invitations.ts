/**
 * @deprecated
 * The invitation accept/activate endpoint has been moved to:
 *   GET  /api/admin/activate?token=...  (peek)
 *   POST /api/admin/activate            (activate)
 *
 * This file is retained for import compatibility only.
 * The Hono router is intentionally empty — no routes are registered here.
 */
import { Hono } from "hono";
import type { AuthorizedEnv } from "../middleware/authorization";

export const invitationRoutes = new Hono<AuthorizedEnv>();
