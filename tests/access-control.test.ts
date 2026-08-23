import assert from "node:assert/strict";
import test from "node:test";
import { artifactVisibilityWhere, documentVisibilityWhere } from "../src/lib/access-control";

test("admin dapat melakukan governance lintas unit", () => {
  assert.deepEqual(documentVisibilityWhere({ id: "admin", role: "ADMIN", unitId: null }), {});
});

test("user hanya melihat milik sendiri dan unitnya", () => {
  const where = documentVisibilityWhere({ id: "user-1", role: "USER", unitId: "unit-1" });
  assert.deepEqual(where.OR, [{ userId: "user-1" }, { scope: "UNIT", unitId: "unit-1" }]);
  assert.deepEqual(artifactVisibilityWhere({ id: "user-1", role: "USER", unitId: null }).OR, [{ userId: "user-1" }]);
});