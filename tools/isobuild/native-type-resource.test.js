"use strict";

jest.mock("../fs/files", () => ({
  pathJoin: (...parts) => parts.filter(Boolean).join("/"),
  readBufferWithLengthAndOffset: jest.fn(() => Buffer.from("type X = 1;")),
}));

jest.mock("../fs/watch", () => ({
  WatchSet: class WatchSet {},
  sha1: jest.fn(() => "hash"),
}));

jest.mock("./bundler.js", () => ({
  NodeModulesDirectory: {
    readDirsFromJSON: jest.fn(async () => ({})),
  },
}));

jest.mock("../utils/archinfo", () => ({
  host: jest.fn(() => "os.test"),
  matches: jest.fn(() => true),
}));

jest.mock("./compiler", () => ({
  SourceResource: class SourceResource {
    constructor(options) {
      Object.assign(this, options, { type: "source" });
    }
  },
}));

const { Unibuild } = require("./unibuild");

function makeAsset(path, fileOptions) {
  return {
    type: "asset",
    data: Buffer.from(`declare module ${JSON.stringify(path)} {}`),
    path,
    servePath: `/packages/example/${path}`,
    fileOptions,
  };
}

test("native declaration resources stay logical .d.ts files but are invisible to zodern discovery", async () => {
  const builder = {
    write: jest.fn(async () => {}),
    writeToGeneratedFilename: jest.fn(async (path) => path),
  };
  const unibuild = new Unibuild(
    { name: "example" },
    {
      kind: "main",
      arch: "os.test",
      uses: [],
      nodeModulesDirectories: {},
      declaredExports: [],
      resources: [
        makeAsset("native.d.ts", { nativeType: true }),
        makeAsset("legacy.d.ts"),
      ],
    }
  );

  const json = await unibuild.toJSON({
    builder,
    unibuildDir: "os",
    usesModules: true,
    npmDirsToCopy: {},
  });
  const nativeResource = json.resources.find(
    (resource) => resource.path === "native.d.ts"
  );
  const legacyResource = json.resources.find(
    (resource) => resource.path === "legacy.d.ts"
  );

  expect(nativeResource.file).toMatch(/\.meteor-type$/);
  expect(nativeResource.path).toBe("native.d.ts");
  expect(nativeResource.fileOptions).toEqual({ nativeType: true });
  expect(legacyResource.file).toMatch(/\.d\.ts$/);

  // This is the predicate used by zodern:types 1.0.13 when it scans an
  // isopack's raw resources.
  expect(json.resources.filter((resource) => resource.file.endsWith(".d.ts")))
    .toEqual([legacyResource]);

  const loaded = await Unibuild.fromJSON(json, {
    isopack: { name: "example" },
    arch: "os.test",
    unibuildBasePath: "isopack",
  });
  const loadedNative = loaded.resources.find(
    (resource) => resource.path === "native.d.ts"
  );

  expect(loadedNative.fileOptions).toEqual({ nativeType: true });
});
