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

assert.strictEqual(Meteor.isServer, true);
assert.strictEqual(Meteor.isClient, false);

export default module.id;
