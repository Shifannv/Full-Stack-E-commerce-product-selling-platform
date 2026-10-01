import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission, type Actor } from "./authorization";

const actor = (
  roles: string[],
  permissions: string[],
  adminApproved = false,
): Actor => ({ userId: "user-a", roles, permissions, adminApproved });

test("authorization denies pending Admins and enforces explicit permissions", () => {
  assert.equal(
    hasPermission(actor(["ADMIN"], ["orders.view"], false), "orders.view"),
    false,
  );
  assert.equal(
    hasPermission(actor(["ADMIN"], ["orders.view"], true), "orders.view"),
    true,
  );
  assert.equal(hasPermission(actor(["ADMIN"], [], true), "orders.view"), false);
  assert.equal(
    hasPermission(actor(["SUPER_ADMIN"], []), "payouts.approve"),
    true,
  );
});
