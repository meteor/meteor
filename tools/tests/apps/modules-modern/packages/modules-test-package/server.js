import assert from "assert";

import * as common from "./common";
assert.strictEqual(common.ModulesTestPackage, "loaded");

export { ModulesTestPackage } from "./common";

export const where = "server";
await common.checkWhere(where);

ServerPackageVar = "server";
common.checkPackageVars();
