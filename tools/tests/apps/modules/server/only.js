import assert from "assert";
assert.strictEqual(Meteor.isServer, true);
assert.strictEqual(Meteor.isClient, false);
export default module.id;
