import assert from "node:assert/strict";
import test from "node:test";
import { createAuth } from "./auth";
import { authOptions } from "./options";

test("Better Auth enables credential login, disables public credential signup, and uses session tables", () => {
  assert.equal(authOptions.emailAndPassword.enabled, true);
  assert.equal(authOptions.emailAndPassword.disableSignUp, true);
  assert.equal(authOptions.session.modelName, "sessions");
  assert.equal(authOptions.account.accountLinking.disableImplicitLinking, true);
});

test("Better Auth requires all server-only auth and Google OAuth configuration", () => {
  assert.throws(() => createAuth({} as never), /configuration is incomplete/);
});
