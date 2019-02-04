import assert from "assert";

const gitShaPattern = /^[0-9a-z]{40}$/;

describe("git-revision", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "git-revision");
  });

  it("Meteor.gitRevision is defined", function () {
    assert.strictEqual(typeof Meteor.gitRevision, "string");
    assert(gitShaPattern.test(Meteor.gitRevision), Meteor.gitRevision);
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
});
