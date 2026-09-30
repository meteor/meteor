import assert from "assert";
import { Meteor } from "meteor/meteor";

describe("run client test", () => {
  it("Runs a client test", async () => {
    console.log("Client test ran");
    assert(Meteor.isClient);
  });
});
