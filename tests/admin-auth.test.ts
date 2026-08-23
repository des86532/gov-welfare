import assert from "node:assert/strict";
import test from "node:test";
import { isAdminAuthorization } from "../lib/admin-auth";

test("Admin Basic Auth 驗證完整密碼且忽略 username", () => {
  assert.equal(isAdminAuthorization(`Basic ${btoa("admin:correct horse")}`, "correct horse"), true);
  assert.equal(isAdminAuthorization(`Basic ${btoa("other:wrong")}`, "correct horse"), false);
  assert.equal(isAdminAuthorization("Bearer token", "correct horse"), false);
  assert.equal(isAdminAuthorization(null, "correct horse"), false);
  assert.equal(isAdminAuthorization(`Basic ${btoa("admin:correct horse")}`, undefined), false);
});
