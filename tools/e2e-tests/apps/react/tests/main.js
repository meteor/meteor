import assert from "assert";
import { Buffer as ImportedBuffer } from "buffer";
import crypto from "crypto";

describe("react", function () {
  it("package.json has correct name", async function () {
    const { name } = await import("../package.json");
    assert.strictEqual(name, "react");
  });

  if (Meteor.isClient) {
    it("client is not server", function () {
      assert.strictEqual(Meteor.isServer, false);
    });

    it("provides Node compatibility for client tests", function () {
      assert.strictEqual(Buffer, ImportedBuffer);
      assert.strictEqual(Buffer.from("meteor").toString("hex"), "6d6574656f72");
      assert.strictEqual(
        crypto.createHash("sha256").update("meteor-rspack").digest("hex"),
        "5e2fed2db9ab31f41ef49674e51532b84d83a2839c46697c55001a855224827d",
      );
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
