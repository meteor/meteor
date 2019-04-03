import assert from "assert";

const gitShaPattern = /^[0-9a-z]{40}$/;

describe("git-commit-hash", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "git-commit-hash");
  });

  it("Meteor.gitCommitHash is defined", function () {
    assert.strictEqual(typeof Meteor.gitCommitHash, "string");
    assert(gitShaPattern.test(Meteor.gitCommitHash), Meteor.gitCommitHash);
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
