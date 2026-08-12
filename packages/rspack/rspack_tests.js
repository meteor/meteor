import {
  RSPACK_EXTENSIONS_TO_IGNORE,
  getRspackFileExtensionsToIgnore,
} from "./lib/file-extensions";

Tinytest.add("rspack - file extensions - default ownership is bounded and complete", (test) => {
  test.equal(RSPACK_EXTENSIONS_TO_IGNORE, [
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".wasm",
    ".css",
  ]);

  test.equal(
    new Set(RSPACK_EXTENSIONS_TO_IGNORE).size,
    RSPACK_EXTENSIONS_TO_IGNORE.length,
    "the static list should not contain duplicates",
  );

  RSPACK_EXTENSIONS_TO_IGNORE.forEach((extension) => {
    test.matches(extension, /^\.[a-z0-9]+$/, `invalid extension: ${extension}`);
  });
});

Tinytest.add("rspack - file extensions - optional compiler formats remain visible", (test) => {
  const extensions = getRspackFileExtensionsToIgnore();

  [
    ".html",
    ".less",
    ".scss",
    ".sass",
    ".styl",
    ".coffee",
    ".vue",
    ".svelte",
    ".graphql",
    ".pug",
  ].forEach((extension) => {
    test.isFalse(
      extensions.includes(extension),
      `${extension} requires an explicit ownership signal`,
    );
  });
});

Tinytest.add("rspack - file extensions - returns a fresh deterministic list", (test) => {
  const first = getRspackFileExtensionsToIgnore();
  first.push(".mutated");

  const second = getRspackFileExtensionsToIgnore();
  test.equal(second, RSPACK_EXTENSIONS_TO_IGNORE);
  test.isFalse(second.includes(".mutated"));
  test.isFalse(RSPACK_EXTENSIONS_TO_IGNORE.includes(".mutated"));
});
