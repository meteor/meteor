import assert from "assert";

import {checkPackageVars} from "./common";

// This verifies that Meteor packages can import native Node modules on
// the client that are not implemented by meteor-node-stubs, in case the
// app has a custom stub installed that takes precedence.
import {notEmpty} from "repl";
assert.strictEqual(notEmpty, true);

export const where = "client";
export * from "./common";

var style = require("./css/imported.css");
if (! style) {
  require("./css/not-imported.css");
}

ClientPackageVar = "client";
checkPackageVars();
