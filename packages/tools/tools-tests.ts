import { Tinytest } from "meteor/tinytest";

// Type compilation tests for meteor/tools

Tinytest.add("tools types - Assets.getTextAsync is a function", (test) => {
  test.isTrue(
    typeof Assets.getTextAsync === "function",
    "Assets.getTextAsync should be a function"
  );
});

Tinytest.add("tools types - Assets.getBinaryAsync is a function", (test) => {
  test.isTrue(
    typeof Assets.getBinaryAsync === "function",
    "Assets.getBinaryAsync should be a function"
  );
});

Tinytest.add("tools types - Assets.absoluteFilePath returns string", (test) => {
  const result = Assets.absoluteFilePath("test.txt");
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
