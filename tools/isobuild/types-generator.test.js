"use strict";

/**
 * Unit tests for tools/isobuild/types-generator.js
 *
 * Each test uses in-memory fake isopacks / packageMaps so there is no
 * filesystem or build-system dependency.  The `../fs/files` module is mocked
 * so we can assert on what was written without touching the real disk.
 */

jest.mock("../fs/files", () => ({
  pathJoin: (...args) => args.join("/"),
  mkdir_p: jest.fn(),
  // Throw by default (file does not exist yet) – individual tests may override.
  readFile: jest.fn(() => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
  writeFile: jest.fn(),
}));

const { generateTypes } = require("./types-generator");
const files = require("../fs/files");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a fake isopack resource with the given path and text content. */
function makeResource(path, content) {
  return { path, type: "asset", data: Buffer.from(content, "utf8") };
}

/**
 * Create a minimal fake isopack.
 * @param {Object} opts
 * @param {string|null}  opts.typesEntry    - value for isopack.typesEntry
 * @param {Object|null}  opts.typesModules  - value for isopack.typesModules
 * @param {Array}        opts.resources     - flat list of resources placed in one unibuild
 */
function makeIsopack({
  typesEntry = null,
  typesModules = null,
  resources = [],
} = {}) {
  return { typesEntry, typesModules, unibuilds: [{ resources }] };
}

/** Create a fake packageMap that iterates over the given names in order. */
function makePackageMap(names) {
  return {
    eachPackage: async (fn) => {
      for (const name of names) await fn(name);
    },
  };
}

/** Create a fake IsopackCache backed by a plain object. */
function makeIsopackCache(isopacks) {
  return {
    getIsopack: (name) => {
      if (!isopacks[name]) throw new Error(`No isopack for "${name}"`);
      return isopacks[name];
    },
  };
}

/** Return the string that was written to the given path, or null if never written. */
function writtenContentAt(path) {
  const call = files.writeFile.mock.calls.find((c) => c[0] === path);
  return call ? call[1].toString("utf8") : null;
}

// Reusable paths derived from a fake project local dir
const PROJECT_LOCAL = "/proj/.meteor/local";
const TYPES_DIR = `${PROJECT_LOCAL}/types`;
const PKGS_DIR = `${TYPES_DIR}/packages`;
const PACKAGES_DTS = `${TYPES_DIR}/packages.d.ts`;

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // By default, pretend every file is new (readFile throws ENOENT).
  files.readFile.mockImplementation(() => {
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  });
});

// ---------------------------------------------------------------------------
// Directory setup
// ---------------------------------------------------------------------------

describe("directory setup", () => {
  test("creates the packages subdirectory", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({}),
      packageMap: makePackageMap([]),
      projectLocalDir: PROJECT_LOCAL,
    });
    expect(files.mkdir_p).toHaveBeenCalledWith(PKGS_DIR);
  });
});

// ---------------------------------------------------------------------------
// Skipping packages
// ---------------------------------------------------------------------------

describe("skipping packages", () => {
  test("skips a package whose isopack is not in the cache", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({}), // empty
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/random");
  });

  test("skips a package with no type resources", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({ random: makeIsopack() }),
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/random");
  });

  test("skips a package when typesEntry points to a missing resource", async () => {
    const isopack = makeIsopack({
      typesEntry: "missing.d.ts",
      resources: [], // the file referenced by typesEntry does not exist
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/random");
  });
});

// ---------------------------------------------------------------------------
// Priority 1: api.types() → isopack.typesEntry
// ---------------------------------------------------------------------------

describe("priority 1 – api.types() / isopack.typesEntry", () => {
  const CONTENT = "export declare const Random: { id(): string };";

  test("writes the per-package .d.ts file", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", CONTENT)],
        }),
      }),
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    expect(writtenContentAt(`${PKGS_DIR}/random.d.ts`)).toBe(CONTENT);
  });

  test("emits `declare module 'meteor/random'` in packages.d.ts", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", CONTENT)],
        }),
      }),
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/random'");
    expect(dts).toContain("export * from './packages/random.d.ts'");
  });

  test("handles multiple packages", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", CONTENT)],
        }),
        tracker: makeIsopack({
          typesEntry: "tracker.d.ts",
          resources: [
            makeResource("tracker.d.ts", "export declare class Tracker {}"),
          ],
        }),
      }),
      packageMap: makePackageMap(["random", "tracker"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/random'");
    expect(dts).toContain("declare module 'meteor/tracker'");
  });
});

// ---------------------------------------------------------------------------
// Priority 2: package-types.json (backward compatibility)
// ---------------------------------------------------------------------------

describe("priority 2 – package-types.json", () => {
  const CONTENT = "export declare function useTracker<T>(fn: () => T): T;";

  test("reads typesEntry from package-types.json and writes the .d.ts", async () => {
    const config = JSON.stringify({ typesEntry: "react-meteor-data.d.ts" });
    const isopack = makeIsopack({
      resources: [
        makeResource("package-types.json", config),
        makeResource("react-meteor-data.d.ts", CONTENT),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "react-meteor-data": isopack }),
      packageMap: makePackageMap(["react-meteor-data"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    expect(writtenContentAt(`${PKGS_DIR}/react-meteor-data.d.ts`)).toBe(
      CONTENT
    );
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/react-meteor-data'");
  });

  test("skips if package-types.json has no typesEntry field", async () => {
    const isopack = makeIsopack({
      resources: [makeResource("package-types.json", JSON.stringify({}))],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/pkg");
  });

  test("skips if package-types.json is malformed JSON", async () => {
    const isopack = makeIsopack({
      resources: [makeResource("package-types.json", "not-json{{{")],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/pkg");
  });
});

// ---------------------------------------------------------------------------
// Priority 3: auto-detect single .d.ts resource
// ---------------------------------------------------------------------------

describe("priority 3 – auto-detect single .d.ts", () => {
  test("uses the only .d.ts resource when there is exactly one", async () => {
    const isopack = makeIsopack({
      resources: [
        makeResource("tracker.d.ts", "export declare class Tracker {}"),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ tracker: isopack }),
      packageMap: makePackageMap(["tracker"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/tracker'");
  });

  test("does NOT auto-detect when there are multiple .d.ts resources", async () => {
    const isopack = makeIsopack({
      resources: [
        makeResource("a.d.ts", "export declare const a: string;"),
        makeResource("b.d.ts", "export declare const b: string;"),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "some-pkg": isopack }),
      packageMap: makePackageMap(["some-pkg"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/some-pkg");
  });
});

// ---------------------------------------------------------------------------
// Sub-path modules (fixes zodern/meteor-types#10)
// ---------------------------------------------------------------------------

describe("sub-path modules (issue #10)", () => {
  const MAIN = "export declare function useTracker<T>(fn: () => T): T;";
  const SUSPENSE =
    "export declare function useTracker<T>(fn: () => T, deps?: any[]): T;";

  test("writes separate .d.ts file for each sub-path module", async () => {
    const isopack = makeIsopack({
      typesEntry: "main.d.ts",
      typesModules: { suspense: "suspense.d.ts" },
      resources: [
        makeResource("main.d.ts", MAIN),
        makeResource("suspense.d.ts", SUSPENSE),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "react-meteor-data": isopack }),
      packageMap: makePackageMap(["react-meteor-data"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    expect(writtenContentAt(`${PKGS_DIR}/react-meteor-data.d.ts`)).toBe(MAIN);
    expect(
      writtenContentAt(`${PKGS_DIR}/react-meteor-data__suspense.d.ts`)
    ).toBe(SUSPENSE);
  });

  test("emits declare module for main and sub-path in packages.d.ts", async () => {
    const isopack = makeIsopack({
      typesEntry: "main.d.ts",
      typesModules: { suspense: "suspense.d.ts" },
      resources: [
        makeResource("main.d.ts", MAIN),
        makeResource("suspense.d.ts", SUSPENSE),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "react-meteor-data": isopack }),
      packageMap: makePackageMap(["react-meteor-data"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/react-meteor-data'");
    expect(dts).toContain("declare module 'meteor/react-meteor-data/suspense'");
    expect(dts).toContain(
      "export * from './packages/react-meteor-data__suspense.d.ts'"
    );
  });

  test("sub-path modules from package-types.json", async () => {
    const config = JSON.stringify({
      typesEntry: "main.d.ts",
      modules: { hooks: "hooks.d.ts" },
    });
    const isopack = makeIsopack({
      resources: [
        makeResource("package-types.json", config),
        makeResource("main.d.ts", MAIN),
        makeResource("hooks.d.ts", "export declare function useFind(): any;"),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "react-meteor-data": isopack }),
      packageMap: makePackageMap(["react-meteor-data"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/react-meteor-data/hooks'");
  });
});

// ---------------------------------------------------------------------------
// Package name normalization
// ---------------------------------------------------------------------------

describe("package name normalization", () => {
  test("replaces `:` with `_` in filenames (colon-based author:package names)", async () => {
    const content = "export declare const x: number;";
    const isopack = makeIsopack({
      typesEntry: "types.d.ts",
      resources: [makeResource("types.d.ts", content)],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "author:package": isopack }),
      packageMap: makePackageMap(["author:package"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    // filename uses underscore
    expect(writtenContentAt(`${PKGS_DIR}/author_package.d.ts`)).toBe(content);
    // but the declare module statement preserves the original colon-name
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("declare module 'meteor/author:package'");
  });
});

// ---------------------------------------------------------------------------
// writeIfChanged optimisation
// ---------------------------------------------------------------------------

describe("writeIfChanged", () => {
  test("skips write when existing file has identical content", async () => {
    const content = "export declare const Random: { id(): string };";
    const isopack = makeIsopack({
      typesEntry: "random.d.ts",
      resources: [makeResource("random.d.ts", content)],
    });
    // Simulate file already on disk with the same content
    files.readFile.mockImplementation((p) => {
      if (p === `${PKGS_DIR}/random.d.ts`) return Buffer.from(content);
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const perPkgWrites = files.writeFile.mock.calls.filter(
      (c) => c[0] === `${PKGS_DIR}/random.d.ts`
    );
    expect(perPkgWrites).toHaveLength(0);
  });

  test("writes when existing file has different content", async () => {
    const oldContent = "export declare const old: string;";
    const newContent = "export declare const newer: string;";
    const isopack = makeIsopack({
      typesEntry: "random.d.ts",
      resources: [makeResource("random.d.ts", newContent)],
    });
    files.readFile.mockImplementation((p) => {
      if (p === `${PKGS_DIR}/random.d.ts`) return Buffer.from(oldContent);
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectLocalDir: PROJECT_LOCAL,
    });
    expect(writtenContentAt(`${PKGS_DIR}/random.d.ts`)).toBe(newContent);
  });
});

// ---------------------------------------------------------------------------
// packages.d.ts header
// ---------------------------------------------------------------------------

describe("packages.d.ts output", () => {
  test("includes auto-generated header comment", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({}),
      packageMap: makePackageMap([]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("auto-generated by Meteor");
  });

  test("is always written even when no packages have types", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({}),
      packageMap: makePackageMap([]),
      projectLocalDir: PROJECT_LOCAL,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toBeTruthy();
  });
});
