import assert from "assert";

export const testMessage = "Welcome to Meteor!";

describe("~name~", () => {
  it("package.json has correct name", () => {
    const { name } = require("../package.json");
    assert.strictEqual(name, "~name~");
  });

  if (Meteor.isClient) {
    it("client is not server", () => {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", () => {
      assert.strictEqual(Meteor.isClient, false);
    });
  }

  it("async/await and dynamic import()", async () => {
    const tests = await import("./main.js");
    assert.strictEqual(tests.testMessage, testMessage);
  });
});
