import assert from "assert";

import "github";
import "aws-sdk";
import "stripe";
import "winston";
import "mssql";

// This package has a native .node module as the "main" property of its
// package.json file. (#7947)
import { start } from "idle-gc";
assert.strictEqual(typeof start, "function");

assert.strictEqual(Meteor.isServer, true);
assert.strictEqual(Meteor.isClient, false);

export default module.id;
