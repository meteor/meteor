const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Withhold notifications to simulate a rebuild triggered elsewhere in the app.
// Keep the real filesystem, ignore matcher, and optimistic cache in this test.
jest.mock("./safe-watcher", () => ({
  watch: () => ({ close() {} }),
}));

jest.mock("../tool-env/profile", () => ({
  Profile: (_name, fn) => fn,
}));

jest.mock("./files", () => ({
  pathSep: path.sep,
  pathBasename: path.basename,
  pathDirname: path.dirname,
  pathIsAbsolute: path.isAbsolute,
  pathJoin: path.join,
  statOrNull: (filePath) => {
    try {
      return fs.statSync(filePath);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  },
  lstat: fs.lstatSync,
  readFile: fs.readFileSync,
  readdir: fs.readdirSync,
  dependOnPath: () => {},
  findAppDir: () => null,
}));

const { optimisticReadMeteorIgnore } = require("./optimistic.ts");
const files = require("./files");

let appDir;
let ignorePath;

// Show which files are ignored directly, without negating matcher results.
const ignoredFiles = () => {
  // The source scanner passes the path found in its current directory listing.
  const listedPath = fs.readdirSync(appDir).includes(".meteorignore") ? ignorePath : null;
  const rules = optimisticReadMeteorIgnore(listedPath, "legacy.js", "root.js");
  return ["c.js", "d.js", "legacy.js", "root.js"].filter((file) => rules.ignores(file));
};

beforeEach(() => {
  appDir = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-ignore-cache-"));
  ignorePath = path.join(appDir, ".meteorignore");
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(appDir, { recursive: true, force: true });
});

test("drops deleted .meteorignore rules before its watcher notifications arrive", () => {
  fs.writeFileSync(ignorePath, "c.*");
  expect(ignoredFiles()).toEqual(["c.js", "legacy.js", "root.js"]);

  fs.unlinkSync(ignorePath);
  // Changes elsewhere can start a scan before this file or directory is polled.
  expect(ignoredFiles()).toEqual(["legacy.js", "root.js"]);
});

test("reads newly created .meteorignore files and still observes content edits", () => {
  expect(ignoredFiles()).toEqual(["legacy.js", "root.js"]);

  fs.writeFileSync(ignorePath, "c.*");
  expect(ignoredFiles()).toEqual(["c.js", "legacy.js", "root.js"]);

  fs.writeFileSync(ignorePath, "d.*");
  expect(ignoredFiles()).toEqual(["d.js", "legacy.js", "root.js"]);
});

test("does no ignore-file I/O when the listing contains no .meteorignore", () => {
  const stat = jest.spyOn(files, "statOrNull");
  const read = jest.spyOn(files, "readFile");

  expect(ignoredFiles()).toEqual(["legacy.js", "root.js"]);
  expect(stat).not.toHaveBeenCalled();
  expect(read).not.toHaveBeenCalled();
});

test("handles an ignore file deleted after the directory was listed", () => {
  fs.writeFileSync(ignorePath, "c.*");
  expect(ignoredFiles()).toEqual(["c.js", "legacy.js", "root.js"]);

  fs.unlinkSync(ignorePath);
  const rules = optimisticReadMeteorIgnore(ignorePath, "legacy.js", "root.js");
  expect(rules.ignores("c.js")).toBe(false);
  expect(rules.ignores("legacy.js")).toBe(true);
  expect(rules.ignores("root.js")).toBe(true);
});
