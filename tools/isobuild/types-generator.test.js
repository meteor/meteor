"use strict";

/**
 * Unit tests for tools/isobuild/types-generator.js
 *
 * Each test uses in-memory fake isopacks / packageMaps so there is no
 * filesystem or build-system dependency.  The `../fs/files` module is mocked
 * so we can assert on what was written without touching the real disk.
 * Symlinks are recorded in a Map (link path -> target) exposed as
 * `files.__symlinks`.
 */

jest.mock("../fs/files", () => {
  // Note: this factory is hoisted by Jest, so all state lives inside it.
  const symlinks = new Map();
  return {
    __symlinks: symlinks,
    pathJoin: (...args) => args.join("/"),
    convertToOSPath: (p) => p,
    mkdir_p: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    exists: jest.fn(),
    readdir: jest.fn(),
    unlink: jest.fn(),
    rm_recursive: jest.fn(),
    lstat: jest.fn(),
    readlink: jest.fn(),
    symlinkWithOverwrite: jest.fn(),
  };
});

jest.mock("../console/console.js", () => ({
  Console: { debug: jest.fn(), warn: jest.fn() },
}));

const { generateTypes } = require("./types-generator");
const files = require("../fs/files");

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function enoent() {
  return Object.assign(new Error("ENOENT"), { code: "ENOENT" });
}

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
 * @param {string|null}  opts.isopackPath   - fake on-disk root of the isopack
 */
function makeIsopack({
  typesEntry = null,
  typesModules = null,
  resources = [],
  isopackPath = null,
} = {}) {
  return { typesEntry, typesModules, unibuilds: [{ resources }], isopackPath };
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

// Reusable paths derived from a fake project .meteor dir
const PROJECT_METEOR = "/proj/.meteor";
const TYPES_DIR = `${PROJECT_METEOR}/types`;
const PKGS_DIR = `${TYPES_DIR}/packages`;
const PACKAGES_DTS = `${TYPES_DIR}/packages.d.ts`;

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  files.__symlinks.clear();
  // By default, pretend every file is new (readFile throws ENOENT).
  files.readFile.mockImplementation(() => {
    throw enoent();
  });
  // No npm/node_modules directories exist unless a test says so.
  files.exists.mockImplementation(() => false);
  // Directories are empty unless a test says otherwise.
  files.readdir.mockImplementation(() => []);
  // lstat/readlink/symlinkWithOverwrite/rm_recursive act on the symlink map.
  files.lstat.mockImplementation((p) => {
    if (files.__symlinks.has(p)) return { isSymbolicLink: () => true };
    throw enoent();
  });
  files.readlink.mockImplementation((p) => {
    if (!files.__symlinks.has(p)) {
      throw Object.assign(new Error("EINVAL"), { code: "EINVAL" });
    }
    return files.__symlinks.get(p);
  });
  files.symlinkWithOverwrite.mockImplementation(async (source, target) => {
    files.__symlinks.set(target, source);
  });
  files.rm_recursive.mockImplementation(async (p) => {
    files.__symlinks.delete(p);
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
      projectMeteorDir: PROJECT_METEOR,
    });
    expect(files.mkdir_p).toHaveBeenCalledWith(PKGS_DIR);
  });

  test("creates one directory per package with types", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", "export const x: number;")],
        }),
      }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    expect(files.mkdir_p).toHaveBeenCalledWith(`${PKGS_DIR}/random`);
  });

  test("writes a .gitignore that ignores the whole types dir", async () => {
    // .meteor/.gitignore in apps only ignores `local`, so the generated
    // output needs its own .gitignore to stay untracked.
    await generateTypes({
      isopackCache: makeIsopackCache({}),
      packageMap: makePackageMap([]),
      projectMeteorDir: PROJECT_METEOR,
    });
    expect(writtenContentAt(`${TYPES_DIR}/.gitignore`)).toBe("*\n");
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/random");
  });

  test("skips a package with no type resources", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({ random: makeIsopack() }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
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
      projectMeteorDir: PROJECT_METEOR,
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

  test("writes the per-package index.d.ts wrapped in declare module", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", CONTENT)],
        }),
      }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkg = writtenContentAt(`${PKGS_DIR}/random/index.d.ts`);
    expect(perPkg).toContain("declare module 'meteor/random'");
    expect(perPkg).toContain(CONTENT);
  });

  test("packages.d.ts references per-package file via triple-slash", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", CONTENT)],
        }),
      }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/random/index.d.ts" />'
    );
    // barrel must NOT use relative re-exports inside declare module
    expect(dts).not.toContain("export * from");
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/random/index.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/tracker/index.d.ts" />'
    );
    // per-package files carry the declare module wrappers
    expect(writtenContentAt(`${PKGS_DIR}/random/index.d.ts`)).toContain(
      "declare module 'meteor/random'"
    );
    expect(writtenContentAt(`${PKGS_DIR}/tracker/index.d.ts`)).toContain(
      "declare module 'meteor/tracker'"
    );
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/index.d.ts`
    );
    expect(perPkg).toContain("declare module 'meteor/react-meteor-data'");
    expect(perPkg).toContain(CONTENT);
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/index.d.ts" />'
    );
  });

  test("skips if package-types.json has no typesEntry field", async () => {
    const isopack = makeIsopack({
      resources: [makeResource("package-types.json", JSON.stringify({}))],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/pkg");
  });

  test("resolves module paths with a leading './' (real-world react-meteor-data case)", async () => {
    // package-types.json uses "./suspense/foo.d.ts" but isobuild normalizes
    // asset paths via pathRelative('.', p), storing them as "suspense/foo.d.ts".
    // The generator must strip the leading "./" before looking up resources.
    const MAIN = "export declare function useTracker<T>(fn: () => T): T;";
    const SUSPENSE =
      "export declare function useTracker<T>(fn: () => T, deps?: any[]): T;";
    const config = JSON.stringify({
      typesEntry: "react-meteor-data.d.ts",
      modules: { suspense: "./suspense/react-meteor-data.d.ts" },
    });
    const isopack = makeIsopack({
      resources: [
        makeResource("package-types.json", config),
        makeResource("react-meteor-data.d.ts", MAIN),
        // stored WITHOUT the leading "./" (as isobuild does)
        makeResource("suspense/react-meteor-data.d.ts", SUSPENSE),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "react-meteor-data": isopack }),
      packageMap: makePackageMap(["react-meteor-data"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/index.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/suspense.d.ts" />'
    );
    const suspensePkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/suspense.d.ts`
    );
    expect(suspensePkg).toContain(
      "declare module 'meteor/react-meteor-data/suspense'"
    );
    expect(suspensePkg).toContain(SUSPENSE);
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkg = writtenContentAt(`${PKGS_DIR}/tracker/index.d.ts`);
    expect(perPkg).toContain("declare module 'meteor/tracker'");
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/tracker/index.d.ts" />'
    );
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
      projectMeteorDir: PROJECT_METEOR,
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const mainPkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/index.d.ts`
    );
    expect(mainPkg).toContain("declare module 'meteor/react-meteor-data'");
    expect(mainPkg).toContain(MAIN);
    const subPkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/suspense.d.ts`
    );
    expect(subPkg).toContain(
      "declare module 'meteor/react-meteor-data/suspense'"
    );
    expect(subPkg).toContain(SUSPENSE);
  });

  test("packages.d.ts references main and sub-path via triple-slash", async () => {
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/index.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/suspense.d.ts" />'
    );
    // must NOT have relative re-exports inside declare module blocks
    expect(dts).not.toContain("export * from");
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/hooks.d.ts" />'
    );
    const hooksPkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/hooks.d.ts`
    );
    expect(hooksPkg).toContain(
      "declare module 'meteor/react-meteor-data/hooks'"
    );
  });

  test('a sub-path module named "index" is skipped instead of clobbering index.d.ts', async () => {
    const isopack = makeIsopack({
      typesEntry: "main.d.ts",
      typesModules: { index: "sub-index.d.ts" },
      resources: [
        makeResource("main.d.ts", MAIN),
        makeResource("sub-index.d.ts", "export declare const clash: 1;"),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const mainPkg = writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`);
    // main entry survives untouched…
    expect(mainPkg).toContain("declare module 'meteor/pkg'");
    expect(mainPkg).not.toContain("meteor/pkg/index");
    // …and the colliding sub-module is not referenced by the barrel
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).not.toContain("meteor/pkg/index");
  });
});

// ---------------------------------------------------------------------------
// Files that already contain their own declare module (zodern:types style)
// ---------------------------------------------------------------------------

describe("pre-declared modules are used verbatim", () => {
  const PRE_DECLARED = [
    "declare module 'meteor/zodern:relay' {",
    "  export function createMethod(config: any): any;",
    "}",
  ].join("\n");

  test("does not double-wrap a file that already has declare module", async () => {
    const isopack = makeIsopack({
      typesEntry: "relay.d.ts",
      resources: [makeResource("relay.d.ts", PRE_DECLARED)],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "zodern:relay": isopack }),
      packageMap: makePackageMap(["zodern:relay"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkg = writtenContentAt(`${PKGS_DIR}/zodern_relay/index.d.ts`);
    // content is emitted verbatim…
    expect(perPkg).toBe(`${PRE_DECLARED}\n`);
    // …and in particular NOT nested inside another declare module
    expect(perPkg.match(/declare module/g)).toHaveLength(1);
  });

  test('double-quoted declare module ("meteor/pkg") is also detected', async () => {
    const content = 'declare module "meteor/pkg" {\n  export const x: number;\n}';
    const isopack = makeIsopack({
      typesEntry: "pkg.d.ts",
      resources: [makeResource("pkg.d.ts", content)],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkg = writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`);
    expect(perPkg.match(/declare module/g)).toHaveLength(1);
  });

  test("sub-path module files with their own declare module are used verbatim", async () => {
    const sub = [
      "declare module 'meteor/pkg/sub' {",
      "  export const y: string;",
      "}",
    ].join("\n");
    const isopack = makeIsopack({
      typesEntry: "main.d.ts",
      typesModules: { sub: "sub.d.ts" },
      resources: [
        makeResource("main.d.ts", "export declare const x: number;"),
        makeResource("sub.d.ts", sub),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    // plain main file is wrapped…
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toContain(
      "declare module 'meteor/pkg'"
    );
    // …while the pre-declared sub-path file is passed through unchanged
    expect(writtenContentAt(`${PKGS_DIR}/pkg/sub.d.ts`)).toBe(`${sub}\n`);
  });

  test("wraps files with top-level namespaces and non-relative imports", async () => {
    const content = [
      "import { Mongo } from 'meteor/mongo';",
      "export namespace Random {",
      "  function id(numberOfChars?: number): string;",
      "}",
    ].join("\n");
    const isopack = makeIsopack({
      typesEntry: "random.d.ts",
      resources: [makeResource("random.d.ts", content)],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkg = writtenContentAt(`${PKGS_DIR}/random/index.d.ts`);
    // namespaces and non-relative imports are valid inside an ambient module
    // block, so these files ARE wrapped
    expect(perPkg).toContain("declare module 'meteor/random'");
    expect(perPkg).toContain("import { Mongo } from 'meteor/mongo';");
    expect(perPkg).toContain("export namespace Random {");
  });
});

// ---------------------------------------------------------------------------
// Package name normalization
// ---------------------------------------------------------------------------

describe("package name normalization", () => {
  test("replaces `:` with `_` in directory names (colon-based author:package names)", async () => {
    const content = "export declare const x: number;";
    const isopack = makeIsopack({
      typesEntry: "types.d.ts",
      resources: [makeResource("types.d.ts", content)],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "author:package": isopack }),
      packageMap: makePackageMap(["author:package"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    // directory uses underscore, but declare module preserves the original colon-name
    const perPkg = writtenContentAt(`${PKGS_DIR}/author_package/index.d.ts`);
    expect(perPkg).toContain("declare module 'meteor/author:package'");
    expect(perPkg).toContain(content);
    // barrel references by normalized directory name
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/author_package/index.d.ts" />'
    );
  });

  test("colliding module keys (`a/b` vs `a__b`) map to distinct filenames", async () => {
    const SLASH = "export declare const fromSlash: number;";
    const UNDERSCORE = "export declare const fromUnderscore: number;";
    const isopack = makeIsopack({
      typesEntry: "main.d.ts",
      typesModules: { "a/b": "slash.d.ts", a__b: "underscore.d.ts" },
      resources: [
        makeResource("main.d.ts", "export declare const main: number;"),
        makeResource("slash.d.ts", SLASH),
        makeResource("underscore.d.ts", UNDERSCORE),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    // '/' maps to '__' while literal '_' escapes to '_u', so the two keys
    // can no longer overwrite each other's file
    const slashPkg = writtenContentAt(`${PKGS_DIR}/pkg/a__b.d.ts`);
    expect(slashPkg).toContain("declare module 'meteor/pkg/a/b'");
    expect(slashPkg).toContain(SLASH);
    const underscorePkg = writtenContentAt(`${PKGS_DIR}/pkg/a_u_ub.d.ts`);
    expect(underscorePkg).toContain("declare module 'meteor/pkg/a__b'");
    expect(underscorePkg).toContain(UNDERSCORE);
    // barrel references both distinct files
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/pkg/a__b.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/pkg/a_u_ub.d.ts" />'
    );
  });
});

// ---------------------------------------------------------------------------
// npm deps symlink
// ---------------------------------------------------------------------------

describe("npm deps symlink", () => {
  const CONTENT = "export declare const Random: { id(): string };";
  const ISOPACK_ROOT = "/home/user/.meteor/packages/random/1.0.0";
  const NPM_DIR = `${ISOPACK_ROOT}/npm/node_modules`;
  const LINK = `${PKGS_DIR}/random/node_modules`;

  function randomIsopack({ isopackPath = ISOPACK_ROOT } = {}) {
    return makeIsopack({
      typesEntry: "random.d.ts",
      resources: [makeResource("random.d.ts", CONTENT)],
      isopackPath,
    });
  }

  async function run(isopack) {
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
  }

  test("creates node_modules symlink when the isopack has npm/node_modules", async () => {
    files.exists.mockImplementation((p) => p === NPM_DIR);
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(NPM_DIR, LINK);
    expect(files.__symlinks.get(LINK)).toBe(NPM_DIR);
  });

  test("skips the symlink when the isopack has no npm/node_modules", async () => {
    // files.exists stays false for every path
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalled();
  });

  test("skips the symlink when the isopack does not know its on-disk root", async () => {
    files.exists.mockImplementation(() => true);
    await run(randomIsopack({ isopackPath: null }));
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalled();
  });

  test("leaves an existing symlink with the correct target alone", async () => {
    files.exists.mockImplementation((p) => p === NPM_DIR);
    files.__symlinks.set(LINK, NPM_DIR);
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalled();
    expect(files.__symlinks.get(LINK)).toBe(NPM_DIR);
  });

  test("replaces a symlink pointing at the wrong target", async () => {
    files.exists.mockImplementation((p) => p === NPM_DIR);
    files.__symlinks.set(LINK, "/somewhere/else/npm/node_modules");
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(NPM_DIR, LINK);
    expect(files.__symlinks.get(LINK)).toBe(NPM_DIR);
  });

  test("replaces a non-symlink occupying the node_modules path", async () => {
    files.exists.mockImplementation((p) => p === NPM_DIR);
    // A real directory (not a symlink) sits where the link should go.
    files.lstat.mockImplementation((p) => {
      if (p === LINK) return { isSymbolicLink: () => false };
      throw enoent();
    });
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(NPM_DIR, LINK);
  });

  test("removes a leftover link when the package no longer bundles npm deps", async () => {
    // The link exists from a previous run, but npm/node_modules is gone.
    files.__symlinks.set(LINK, NPM_DIR);
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalled();
    expect(files.rm_recursive).toHaveBeenCalledWith(LINK);
    expect(files.__symlinks.has(LINK)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Stale output cleanup
// ---------------------------------------------------------------------------

describe("stale output cleanup", () => {
  const CONTENT = "export declare const Random: { id(): string };";

  function randomIsopack() {
    return makeIsopack({
      typesEntry: "random.d.ts",
      resources: [makeResource("random.d.ts", CONTENT)],
    });
  }

  async function run(isopacks, names) {
    await generateTypes({
      isopackCache: makeIsopackCache(isopacks),
      packageMap: makePackageMap(names),
      projectMeteorDir: PROJECT_METEOR,
    });
  }

  test("removes package directories for packages no longer in the map", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["random", "old-pkg"];
      if (p === `${PKGS_DIR}/random`) return ["index.d.ts"];
      return [];
    });
    await run({ random: randomIsopack() }, ["random"]);
    expect(files.rm_recursive).toHaveBeenCalledWith(`${PKGS_DIR}/old-pkg`);
    expect(files.rm_recursive).not.toHaveBeenCalledWith(`${PKGS_DIR}/random`);
  });

  test("removes the directory of a package that lost its types", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["random"];
      return [];
    });
    // random is still in the package map but no longer ships types
    await run({ random: makeIsopack() }, ["random"]);
    expect(files.rm_recursive).toHaveBeenCalledWith(`${PKGS_DIR}/random`);
  });

  test("removes old flat-layout .d.ts files directly under packages/", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) {
        return ["random", "random.d.ts", "react-meteor-data__suspense.d.ts"];
      }
      if (p === `${PKGS_DIR}/random`) return ["index.d.ts"];
      return [];
    });
    await run({ random: randomIsopack() }, ["random"]);
    expect(files.unlink).toHaveBeenCalledWith(`${PKGS_DIR}/random.d.ts`);
    expect(files.unlink).toHaveBeenCalledWith(
      `${PKGS_DIR}/react-meteor-data__suspense.d.ts`
    );
    // the new-layout directory must survive the migration
    expect(files.rm_recursive).not.toHaveBeenCalledWith(`${PKGS_DIR}/random`);
  });

  test("prunes dropped files inside a kept package dir but keeps current output", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["random"];
      if (p === `${PKGS_DIR}/random`) {
        return ["index.d.ts", "dropped-module.d.ts", "node_modules"];
      }
      return [];
    });
    await run({ random: randomIsopack() }, ["random"]);
    expect(files.rm_recursive).toHaveBeenCalledWith(
      `${PKGS_DIR}/random/dropped-module.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${PKGS_DIR}/random/index.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${PKGS_DIR}/random/node_modules`
    );
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
    // The generator wraps content before writing; simulate the disk file
    // already having the wrapped content so the write is skipped.
    const wrappedContent = `declare module 'meteor/random' {\n  ${content}\n}\n`;
    files.readFile.mockImplementation((p) => {
      if (p === `${PKGS_DIR}/random/index.d.ts`) {
        return Buffer.from(wrappedContent);
      }
      throw enoent();
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkgWrites = files.writeFile.mock.calls.filter(
      (c) => c[0] === `${PKGS_DIR}/random/index.d.ts`
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
    // Simulate disk having the wrapped OLD content
    const wrappedOld = `declare module 'meteor/random' {\n  ${oldContent}\n}\n`;
    files.readFile.mockImplementation((p) => {
      if (p === `${PKGS_DIR}/random/index.d.ts`) {
        return Buffer.from(wrappedOld);
      }
      throw enoent();
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const written = writtenContentAt(`${PKGS_DIR}/random/index.d.ts`);
    expect(written).toContain("declare module 'meteor/random'");
    expect(written).toContain(newContent);
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
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("auto-generated by Meteor");
  });

  test("is always written even when no packages have types", async () => {
    await generateTypes({
      isopackCache: makeIsopackCache({}),
      packageMap: makePackageMap([]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toBeTruthy();
  });
});
