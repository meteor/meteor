describe("tests/ignored/prefix-*-ignored pattern", () => {
  it("should not run as ignored", () => {
    throw new Error("test should be ignored by eager test loading");
  });
});
