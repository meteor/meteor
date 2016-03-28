import assert from "assert";

import "github";
import "aws-sdk";
import "stripe";
import "winston";
import "mssql";

assert.strictEqual(Meteor.isServer, true);
assert.strictEqual(Meteor.isClient, false);

export default module.id;
