import assert from "assert";

import "github";
import "aws-sdk";
import "stripe";
import "mssql";

import winston from "winston";
import * as winstonNamespace from "winston";
assert.strictEqual(typeof winston.default, "object");
assert.strictEqual(typeof winston.transports.Console, "function");
assert.strictEqual(winstonNamespace.default, winston);

// This package has a native .node module as the "main" property of its
// package.json file. (#7947)
import { start } from "idle-gc";
assert.strictEqual(typeof start, "function");

assert.strictEqual(Meteor.isServer, true);
assert.strictEqual(Meteor.isClient, false);

export default module.id;
