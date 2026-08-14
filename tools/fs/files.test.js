const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const files = require("./files.ts");

let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-files-test-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("rm_recursive_deferred waits for wildcard deletion", async () => {
  const standardTempDir = files.convertToStandardPath(tempDir);
  const oldCachePath = files.pathJoin(standardTempDir, "linker-old.cache");
  const newCachePath = files.pathJoin(standardTempDir, "linker-new.cache");
  const cachePattern = files.pathJoin(standardTempDir, "linker-*.cache");

  files.writeFile(oldCachePath, "old");

  await files.rm_recursive_deferred(cachePattern);

  expect(files.exists(oldCachePath)).toBe(false);

  files.writeFile(newCachePath, "new");
  expect(files.readFile(newCachePath, "utf8")).toBe("new");
});
