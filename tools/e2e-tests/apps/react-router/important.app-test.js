import assert from "assert";

describe("!important.app-test.js pattern", () => {
  it("should run as it's not ignored (negation)", () => {
    assert(true, "should run");
  });
});
