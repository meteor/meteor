import assert from "assert";
import { Meteor } from "meteor/meteor";

describe("Run integration tests", () => {
  it("Runs integration tests", async () => {
    console.log("Integration tests ran");
    assert(Meteor.isAppTest);
    const result = await Meteor.callAsync("test.method");
    assert(Meteor.isServer, "IS SERVER");

    assert.deepEqual(result, { isAppTestInitial: true, isAppTestNow: true });
  });
});
