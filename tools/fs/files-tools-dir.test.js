const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// files.ts loads a few dev_bundle modules at import time; they are not
// installed for unit tests and play no part in resolving the tools directory.
jest.mock("@wry/context", () => ({
  Slot: class {
    getValue() {}
    withValue(value, callback, args = [], thisArg) {
      return callback.apply(thisArg, args);
    }
  },
}), { virtual: true });
jest.mock("optimism", () => ({ dep: () => () => {} }), { virtual: true });
jest.mock("rimraf", () => ({}), { virtual: true });
jest.mock("source-map", () => ({}), { virtual: true });
jest.mock("../tool-env/source-map-retriever-stack.js", () => ({ push: () => {} }));

const { getCurrentToolsDir } = require("./files");

// The directory this tool (a checkout here) runs from: tools/fs/../..
const runningToolsDir = path.resolve(__dirname, "../..");

describe("getCurrentToolsDir with METEOR_WAREHOUSE_DIR", () => {
  const originalEnv = { ...process.env };
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "meteor-warehouse-")));
    delete process.env.SANDBOX;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("uses the running tool when it lives inside the warehouse", () => {
    // A release springboarded to from the warehouse's default tool: the
    // warehouse symlink points elsewhere, but the running tool is the current one.
    const otherTool = path.join(tmpDir, "other-tool");
    fs.mkdirSync(otherTool);
    fs.writeFileSync(path.join(otherTool, "meteor"), "");
    process.env.METEOR_WAREHOUSE_DIR = path.dirname(runningToolsDir);

    expect(getCurrentToolsDir()).toBe(runningToolsDir);
  });

  test("uses the warehouse tool for a checkout outside the warehouse", () => {
    const warehouseTool = path.join(tmpDir, "packages", "meteor-tool", "mt");
    fs.mkdirSync(warehouseTool, { recursive: true });
    fs.writeFileSync(path.join(warehouseTool, "meteor"), "");
    fs.symlinkSync(path.join("packages", "meteor-tool", "mt", "meteor"), path.join(tmpDir, "meteor"));
    process.env.METEOR_WAREHOUSE_DIR = tmpDir;

    expect(getCurrentToolsDir()).toBe(warehouseTool);
  });
});
