import assert from "assert";

describe("cheerio", () => {
  it("should be importable", () => {
    import cheerio from "cheerio";
    assert.strictEqual(typeof cheerio, "object");
    assert.deepEqual(Object.keys(cheerio), ["cheerio"]);
  });
});
