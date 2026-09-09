import assert from "assert";
import files from "../fs/files";

const FILE_BACKED_SOURCE_MAP_VERSION = 1;
const FILE_BACKED_SOURCE_MAP_KEY = "$meteorFileBackedSourceMap";

/**
 * Creates Meteor's private, JSON-safe transport for a source map that must not
 * be parsed or stringified in the tool process.
 */
export function createFileBackedSourceMap({
  path,
  byteLength,
  file = null,
  hash = null,
}) {
  assert.strictEqual(files.pathIsAbsolute(path), true);
  assert.strictEqual(Number.isSafeInteger(byteLength), true);

  return {
    [FILE_BACKED_SOURCE_MAP_KEY]: FILE_BACKED_SOURCE_MAP_VERSION,
    path,
    byteLength,
    file,
    hash,
  };
}

export function isFileBackedSourceMap(value) {
  return value?.[FILE_BACKED_SOURCE_MAP_KEY] ===
    FILE_BACKED_SOURCE_MAP_VERSION &&
    typeof value.path === "string" &&
    Number.isSafeInteger(value.byteLength);
}
