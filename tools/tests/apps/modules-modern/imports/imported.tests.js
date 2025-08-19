import assert from "assert";

export const name = module.id.split("/").pop();

describe(name, () => {
  it("should be imported", () => {
    assert.strictEqual(name, "imported.tests.js");
  });
});
