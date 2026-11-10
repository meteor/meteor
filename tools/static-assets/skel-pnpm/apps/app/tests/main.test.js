import assert from "assert";
import { Meteor } from "meteor/meteor";
import { accentColor, createClientMessage, createServerMessage } from "@example/shared";

describe("pnpm workspace", function () {
  it("uses the generated workspace name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "~name~-app");
  });

  it("loads compiled workspace packages", function () {
    assert.strictEqual(createClientMessage("test"), "domain:client:test");
    assert.strictEqual(createServerMessage("test"), "domain:server:test");
    console.log("pnpm workspace packages compiled");
  });

  it("resolves transitive npm dependencies through the pnpm store", function () {
    assert.strictEqual(accentColor, "#40E0D0");
    console.log("pnpm transitive dependencies resolved");
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
