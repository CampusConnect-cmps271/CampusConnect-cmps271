import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/auth/roles.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { APP_ROLES, PERMISSIONS, resolveRoleLookup, hasPermission } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

it("missing role tables grant no permissions even if stale data contains an administrator role", () => {
  for (const code of ["PGRST205", "42P01"]) {
    const role = resolveRoleLookup({ role: "administrator" }, { code, message: "Missing table" });
    assert.equal(role, null);
    for (const permission of PERMISSIONS) assert.equal(hasPermission(role, permission), false);
  }
});

it("preserves assigned roles and rejects unknown or absent roles", () => {
  for (const role of APP_ROLES) assert.equal(resolveRoleLookup({ role }, null), role);
  assert.equal(resolveRoleLookup(null, null), null);
  assert.equal(resolveRoleLookup({ role: "superadmin" }, null), null);
});

it("does not hide permission, connection, or unrelated schema errors", () => {
  for (const code of ["42501", "PGRST001", "PGRST204"]) {
    assert.throws(() => resolveRoleLookup(null, { code, message: "Unexpected lookup failure" }), /Could not load user role/);
  }
});
