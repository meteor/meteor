import assert from "assert";
// Resolved from this package's node_modules directory (issue #14784).
import * as esmOnlySyntax from "esm-only-syntax";

import * as common from "./common";
assert.strictEqual(common.ModulesTestPackage, "loaded");

export { ModulesTestPackage } from "./common";

export const where = "server";
export { esmOnlySyntax };
await common.checkWhere(where);

ServerPackageVar = "server";
common.checkPackageVars();
