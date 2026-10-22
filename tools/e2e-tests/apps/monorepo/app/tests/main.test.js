import assert from "assert";

describe("monorepo", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "app");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });
  }

  if (Meteor.isServer) {
    it("server is not client", function () {
      assert.strictEqual(Meteor.isClient, false);
    });
  }

  it("is test", function () {
    assert.strictEqual(Meteor.isTest, true);
    assert.strictEqual(Meteor.isAppTest, false);
  });
});
