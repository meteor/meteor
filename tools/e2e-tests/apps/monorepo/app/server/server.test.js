import assert from "assert";
import { Meteor } from "meteor/meteor";

describe("run server test", () => {
  it("Runs a server test", async () => {
    console.log("Server test ran");
    assert(Meteor.isServer);
    assert(Meteor.isTest);
  });
});
