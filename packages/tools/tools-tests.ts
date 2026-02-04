import { Tinytest } from "meteor/tinytest";

// Type compilation tests for meteor/tools

Tinytest.addAsync("tools types - Assets.getTextAsync returns string", async (test) => {
  const result = await Assets.getTextAsync("tools-tests.ts");
  test.isTrue(
    typeof result === "string",
    "Assets.getTextAsync should return a string"
  );
});

Tinytest.addAsync("tools types - Assets.getBinaryAsync returns Uint8Array", async (test) => {
  const result = await Assets.getBinaryAsync("tools-tests.ts");
  test.isTrue(
    result instanceof Uint8Array,
    "Assets.getBinaryAsync should return a Uint8Array"
  );
});

Tinytest.add("tools types - Assets.absoluteFilePath returns string", (test) => {
  const result = Assets.absoluteFilePath("tools-tests.ts");
  test.isTrue(
    typeof result === "string",
    "Assets.absoluteFilePath should return a string"
  );
});

Tinytest.add("tools types - Assets.getServerDir returns string", (test) => {
  const result = Assets.getServerDir();
  test.isTrue(
    typeof result === "string",
    "Assets.getServerDir should return a string"
  );
});
