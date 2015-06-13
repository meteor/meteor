import assert from "assert";

describe("Babel", function() {
  var self = this;

  it("should transform tests.js", () => {
    // This assertion will only pass if `this` is implicitly bound to the
    // same value as `self` above.
    assert.strictEqual(this, self);
  });
});
