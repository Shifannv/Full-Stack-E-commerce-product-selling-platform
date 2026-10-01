import { api, json } from "./client";
import type { Actor } from "./types";

export const authApi = {
  me: () => api<Actor>("/api/me"),
  signIn: (email: string, password: string) =>
    api<unknown>("/api/auth/sign-in/email", {
      method: "POST",
      body: json({ email, password }),
    }),
  signOut: () =>
    api<unknown>("/api/auth/sign-out", { method: "POST", body: "{}" }),
};
