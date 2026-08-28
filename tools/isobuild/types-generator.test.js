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
    pathDirname: (p) => {
      const parts = p.split("/");
      parts.pop();
      return parts.join("/") || ".";
    },
    convertToOSPath: (p) => p,
    mkdir_p: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    exists: jest.fn(),
    readdir: jest.fn(),
    readdirWithTypes: jest.fn(),
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
const { Console } = require("../console/console.js");
const ts = require("typescript");

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

/** Create a fake isopack SOURCE resource (a compiled .ts/.tsx file). */
function makeSourceResource(path, content) {
  return { path, type: "source", data: Buffer.from(content, "utf8") };
}

/**
 * Create a minimal fake isopack.
 * @param {Object} opts
 * @param {string|null}  opts.typesEntry    - value for isopack.typesEntry
 * @param {string|null}  opts.typesDir     - value for isopack.typesDir
 * @param {Object|null}  opts.typesModules  - value for isopack.typesModules
 * @param {Array}        opts.resources     - flat list of resources placed in one unibuild
 * @param {string|null}  opts.isopackPath   - fake on-disk root of the isopack
 */
function makeIsopack({
  typesEntry = null,
  typesDir = null,
  typesModules = null,
  resources = [],
  isopackPath = null,
} = {}) {
  return {
    typesEntry,
    typesDir,
    typesModules,
    unibuilds: [{ resources }],
    isopackPath,
  };
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

/**
 * Compile the generated in-memory files with the real TypeScript compiler.
 * The generator's filesystem is mocked in this suite, so bare specifiers that
 * normally traverse the meteor-package-types symlink are resolved directly to
 * their target in the virtual packages directory.
 */
function compileGenerated(consumer, extraFiles = {}) {
  const virtualFiles = new Map(
    files.writeFile.mock.calls
      .filter(([path]) => /\.[cm]?tsx?$/.test(path))
      .map(([path, data]) => [path, data.toString("utf8")])
  );
  const consumerPath = "/proj/consumer.ts";
  virtualFiles.set(consumerPath, consumer);
  for (const [path, content] of Object.entries(extraFiles)) {
    virtualFiles.set(path, content);
  }

  const options = {
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noEmit: true,
    skipLibCheck: false,
    strict: true,
    target: ts.ScriptTarget.ES2020,
  };
  const defaultHost = ts.createCompilerHost(options, true);
  const host = {
    ...defaultHost,
    fileExists(path) {
      return virtualFiles.has(path) || defaultHost.fileExists(path);
    },
    readFile(path) {
      return virtualFiles.get(path) ?? defaultHost.readFile(path);
    },
    getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile) {
      const source = virtualFiles.get(path);
      if (source !== undefined) {
        return ts.createSourceFile(path, source, languageVersion, true);
      }
      return defaultHost.getSourceFile(
        path,
        languageVersion,
        onError,
        shouldCreateNewSourceFile
      );
    },
  };
  host.resolveModuleNames = (moduleNames, containingFile) =>
    moduleNames.map((moduleName) => {
      if (moduleName.startsWith("meteor-package-types/")) {
        const relPath = moduleName.slice("meteor-package-types/".length);
        const resolvedFileName = `${PKGS_DIR}/${relPath}.d.ts`;
        if (virtualFiles.has(resolvedFileName)) {
          return {
            resolvedFileName,
            extension: ts.Extension.Dts,
            isExternalLibraryImport: true,
          };
        }
      }
      return ts.resolveModuleName(
        moduleName,
        containingFile,
        options,
        host
      ).resolvedModule;
    });

  const program = ts.createProgram(
    [PACKAGES_DTS, consumerPath, ...Object.keys(extraFiles)],
    options,
    host
  );
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));
}

/** Create a fake fs.Dirent for the readdirWithTypes mock. */
function dirent(name, isDir = false) {
  return {
    name,
    isDirectory: () => !!isDir,
    isSymbolicLink: () => false,
  };
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
  files.readdirWithTypes.mockImplementation(() => []);
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

  test("writes a package.json pinning the tree to CommonJS classification", async () => {
    // Without it, moduleResolution node16/nodenext in an app with
    // "type": "module" would classify the generated stubs and copied
    // trees as ESM (export = errors, unresolvable extensionless
    // relative imports).
    await generateTypes({
      isopackCache: makeIsopackCache({}),
      packageMap: makePackageMap([]),
      projectMeteorDir: PROJECT_METEOR,
    });
    expect(writtenContentAt(`${TYPES_DIR}/package.json`)).toBe(
      '{\n  "type": "commonjs"\n}\n'
    );
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

  test("emits a single-file external module that compiles", async () => {
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

    expect(
      compileGenerated(
        "import { Random } from 'meteor/random';\nRandom.id();\n"
      )
    ).toEqual([]);
  });

  test("writes an adapter and preserves the external declaration verbatim", async () => {
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
    expect(perPkg).toContain(
      "require('meteor-package-types/random/declarations/index')"
    );
    expect(
      writtenContentAt(`${PKGS_DIR}/random/declarations/index.d.ts`)
    ).toBe(CONTENT);
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
    expect(
      writtenContentAt(
        `${PKGS_DIR}/react-meteor-data/declarations/index.d.ts`
      )
    ).toBe(CONTENT);
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
      '/// <reference path="./packages/react-meteor-data/module-suspense.d.ts" />'
    );
    const suspensePkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/module-suspense.d.ts`
    );
    expect(suspensePkg).toContain(
      "declare module 'meteor/react-meteor-data/suspense'"
    );
    expect(
      writtenContentAt(
        `${PKGS_DIR}/react-meteor-data/declarations/module-suspense.d.ts`
      )
    ).toBe(SUSPENSE);
  });

  test("ignores legacy module names that can escape a package directory on Windows", async () => {
    const unsafeModuleName = "safe\\..\\..\\escaped";
    const config = JSON.stringify({
      typesEntry: "main.d.ts",
      modules: { [unsafeModuleName]: "escaped.d.ts" },
    });
    const isopack = makeIsopack({
      resources: [
        makeResource("package-types.json", config),
        makeResource("main.d.ts", "export declare const main: number;"),
        makeResource("escaped.d.ts", "export declare const escaped: number;"),
      ],
    });

    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
    });

    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toContain(
      "declare module 'meteor/pkg'"
    );
    expect(files.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining("\\"),
      expect.anything()
    );
    expect(writtenContentAt(PACKAGES_DTS)).not.toContain("escaped");
    expect(Console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Ignoring invalid legacy module name ${JSON.stringify(unsafeModuleName)}`
      )
    );
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
    expect(
      writtenContentAt(
        `${PKGS_DIR}/react-meteor-data/declarations/index.d.ts`
      )
    ).toBe(MAIN);
    const subPkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/module-suspense.d.ts`
    );
    expect(subPkg).toContain(
      "declare module 'meteor/react-meteor-data/suspense'"
    );
    expect(
      writtenContentAt(
        `${PKGS_DIR}/react-meteor-data/declarations/module-suspense.d.ts`
      )
    ).toBe(SUSPENSE);
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
      '/// <reference path="./packages/react-meteor-data/module-suspense.d.ts" />'
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
      '/// <reference path="./packages/react-meteor-data/module-hooks.d.ts" />'
    );
    const hooksPkg = writtenContentAt(
      `${PKGS_DIR}/react-meteor-data/module-hooks.d.ts`
    );
    expect(hooksPkg).toContain(
      "declare module 'meteor/react-meteor-data/hooks'"
    );
  });

  test('a sub-path module named "index" is emitted without clobbering index.d.ts', async () => {
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
    expect(mainPkg).toContain("declare module 'meteor/pkg'");
    expect(mainPkg).not.toContain("meteor/pkg/index");
    const indexModule = writtenContentAt(
      `${PKGS_DIR}/pkg/module-index.d.ts`
    );
    expect(indexModule).toContain("declare module 'meteor/pkg/index'");
    expect(
      writtenContentAt(`${PKGS_DIR}/pkg/declarations/module-index.d.ts`)
    ).toBe("export declare const clash: 1;");
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/pkg/module-index.d.ts" />'
    );
  });

  test("sub-path names with slash, colon, and underscore get distinct files", async () => {
    const isopack = makeIsopack({
      typesEntry: "main.d.ts",
      typesModules: {
        "a/b": "slash.d.ts",
        "a::b": "colon.d.ts",
        "a__b": "underscore.d.ts",
      },
      resources: [
        makeResource("main.d.ts", MAIN),
        makeResource("slash.d.ts", "export declare const slash: 1;"),
        makeResource("colon.d.ts", "export declare const colon: 1;"),
        makeResource("underscore.d.ts", "export declare const underscore: 1;"),
      ],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ pkg: isopack }),
      packageMap: makePackageMap(["pkg"]),
      projectMeteorDir: PROJECT_METEOR,
    });

    expect(writtenContentAt(`${PKGS_DIR}/pkg/module-a_sb.d.ts`)).toContain(
      "declare module 'meteor/pkg/a/b'"
    );
    expect(writtenContentAt(`${PKGS_DIR}/pkg/module-a_c_cb.d.ts`)).toContain(
      "declare module 'meteor/pkg/a::b'"
    );
    expect(writtenContentAt(`${PKGS_DIR}/pkg/module-a_u_ub.d.ts`)).toContain(
      "declare module 'meteor/pkg/a__b'"
    );

    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain("module-a_sb.d.ts");
    expect(dts).toContain("module-a_c_cb.d.ts");
    expect(dts).toContain("module-a_u_ub.d.ts");
  });
});

// ---------------------------------------------------------------------------
// Directory mode (api.types('dist-types/'))
// ---------------------------------------------------------------------------

describe("directory mode – isopack.typesDir", () => {
  // Relative import between the copied files proves they must be shipped
  // verbatim: relative specifiers are invalid inside declare-module blocks.
  const MAIN =
    "import { useFind } from '../client/hooks';\n" +
    "export declare function useTracker<T>(fn: () => T): T;\n";
  const HOOKS = "export declare function useFind(): any;\n";
  const HOOKS_MAP = '{"version":3,"file":"hooks.d.ts"}';

  const RMD_DIR = `${PKGS_DIR}/react-meteor-data`;

  const MAIN_STUB =
    "declare module 'meteor/react-meteor-data' {\n" +
    "  import exports = require('meteor-package-types/react-meteor-data/dist-types/server/main');\n" +
    "  export = exports;\n" +
    "}\n";

  const HOOKS_STUB =
    "declare module 'meteor/react-meteor-data/hooks' {\n" +
    "  import exports = require('meteor-package-types/react-meteor-data/dist-types/client/hooks');\n" +
    "  export = exports;\n" +
    "}\n";

  const TYPES_NM_DIR = `${TYPES_DIR}/node_modules`;
  const PKG_TYPES_LINK = `${TYPES_NM_DIR}/meteor-package-types`;

  function rmdIsopack() {
    return makeIsopack({
      typesDir: "dist-types",
      typesEntry: "dist-types/server/main.d.ts",
      typesModules: { hooks: "dist-types/client/hooks.d.ts" },
      resources: [
        makeResource("dist-types/server/main.d.ts", MAIN),
        makeResource("dist-types/client/hooks.d.ts", HOOKS),
        makeResource("dist-types/client/hooks.d.ts.map", HOOKS_MAP),
      ],
    });
  }

  async function run(isopacks, names) {
    await generateTypes({
      isopackCache: makeIsopackCache(isopacks),
      packageMap: makePackageMap(names),
      projectMeteorDir: PROJECT_METEOR,
    });
  }

  test("copies the declaration folder verbatim, preserving the tree", async () => {
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    // exact contents, no declare-module wrapping, original relative paths
    expect(writtenContentAt(`${RMD_DIR}/dist-types/server/main.d.ts`)).toBe(
      MAIN
    );
    expect(writtenContentAt(`${RMD_DIR}/dist-types/client/hooks.d.ts`)).toBe(
      HOOKS
    );
    // .d.ts.map files ride along
    expect(
      writtenContentAt(`${RMD_DIR}/dist-types/client/hooks.d.ts.map`)
    ).toBe(HOOKS_MAP);
    // nested directories are created
    expect(files.mkdir_p).toHaveBeenCalledWith(`${RMD_DIR}/dist-types/server`);
    expect(files.mkdir_p).toHaveBeenCalledWith(`${RMD_DIR}/dist-types/client`);
  });

  test("writes a bare-specifier stub as index.d.ts (exact content)", async () => {
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    expect(writtenContentAt(`${RMD_DIR}/index.d.ts`)).toBe(MAIN_STUB);
  });

  test("writes a bare-specifier stub per sub-path module (exact content)", async () => {
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    expect(writtenContentAt(`${RMD_DIR}/module-hooks.d.ts`)).toBe(HOOKS_STUB);
  });

  test("packages.d.ts references the stubs, not the copied tree", async () => {
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/index.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/react-meteor-data/module-hooks.d.ts" />'
    );
    // the entry has no ambient declare-module blocks of its own, so the
    // copied tree is reached only through the stubs
    expect(dts).not.toContain("dist-types");
  });

  test("creates the meteor-package-types symlink at the types root", async () => {
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    expect(files.mkdir_p).toHaveBeenCalledWith(TYPES_NM_DIR);
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(
      PKGS_DIR,
      PKG_TYPES_LINK
    );
    expect(files.__symlinks.get(PKG_TYPES_LINK)).toBe(PKGS_DIR);
  });

  test("leaves an existing meteor-package-types symlink alone (idempotent)", async () => {
    files.__symlinks.set(PKG_TYPES_LINK, PKGS_DIR);
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalled();
    expect(files.__symlinks.get(PKG_TYPES_LINK)).toBe(PKGS_DIR);
  });

  test("replaces a meteor-package-types symlink pointing at the wrong target", async () => {
    files.__symlinks.set(PKG_TYPES_LINK, "/somewhere/else/packages");
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(
      PKGS_DIR,
      PKG_TYPES_LINK
    );
    expect(files.__symlinks.get(PKG_TYPES_LINK)).toBe(PKGS_DIR);
  });

  test("does not create the symlink for an ambient-only single file", async () => {
    await run(
      {
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [
            makeResource(
              "random.d.ts",
              "declare module 'meteor/random' { export const x: 1; }"
            ),
          ],
        }),
      },
      ["random"]
    );
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalled();
  });

  test("removes a stale symlink for an ambient-only single file", async () => {
    files.__symlinks.set(PKG_TYPES_LINK, PKGS_DIR);
    await run(
      {
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [
            makeResource(
              "random.d.ts",
              "declare module 'meteor/random' { export const x: 1; }"
            ),
          ],
        }),
      },
      ["random"]
    );

    expect(files.rm_recursive).toHaveBeenCalledWith(PKG_TYPES_LINK);
    expect(files.__symlinks.has(PKG_TYPES_LINK)).toBe(false);
    expect(writtenContentAt(`${PKGS_DIR}/random/index.d.ts`)).toContain(
      "declare module 'meteor/random'"
    );
  });

  test("preserves a non-symlink at the compatibility-link path", async () => {
    files.lstat.mockImplementation((path) => {
      if (path === PKG_TYPES_LINK) {
        return { isSymbolicLink: () => false };
      }
      throw enoent();
    });
    await run(
      {
        random: makeIsopack({
          typesEntry: "random.d.ts",
          resources: [makeResource("random.d.ts", "export const x: 1;")],
        }),
      },
      ["random"]
    );

    expect(files.rm_recursive).not.toHaveBeenCalledWith(PKG_TYPES_LINK);
  });

  test("stale cleanup keeps the copied folder and prunes dropped stubs", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["react-meteor-data"];
      if (p === RMD_DIR) {
        return [
          "index.d.ts",
          "module-hooks.d.ts",
          "dist-types",
          "dropped-module.d.ts",
          "node_modules",
        ];
      }
      return [];
    });
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    expect(files.rm_recursive).toHaveBeenCalledWith(
      `${RMD_DIR}/dropped-module.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/index.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/module-hooks.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/node_modules`
    );
  });

  test("prunes stale files nested inside the copied folder, keeping current ones", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["react-meteor-data"];
      if (p === RMD_DIR) return ["index.d.ts", "module-hooks.d.ts", "dist-types"];
      return [];
    });
    files.readdirWithTypes.mockImplementation((p) => {
      if (p === `${RMD_DIR}/dist-types`) {
        return [
          dirent("server", true),
          dirent("client", true),
          dirent("legacy", true),
        ];
      }
      if (p === `${RMD_DIR}/dist-types/server`) {
        return [dirent("main.d.ts")];
      }
      if (p === `${RMD_DIR}/dist-types/client`) {
        return [
          dirent("hooks.d.ts"),
          dirent("hooks.d.ts.map"),
          dirent("stale.d.ts"),
        ];
      }
      if (p === `${RMD_DIR}/dist-types/legacy`) {
        return [dirent("old.d.ts")];
      }
      return [];
    });
    await run({ "react-meteor-data": rmdIsopack() }, ["react-meteor-data"]);
    // files that vanished from the isopack are unlinked…
    expect(files.unlink).toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/client/stale.d.ts`
    );
    expect(files.unlink).toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/legacy/old.d.ts`
    );
    // …directories left empty by the pruning are removed…
    expect(files.rm_recursive).toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/legacy`
    );
    // …and current files plus their directories survive.
    expect(files.unlink).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/server/main.d.ts`
    );
    expect(files.unlink).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/client/hooks.d.ts`
    );
    expect(files.unlink).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/client/hooks.d.ts.map`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/server`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${RMD_DIR}/dist-types/client`
    );
  });

  test("removes a stale copied folder after switching to single-file mode", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["pkg"];
      if (p === `${PKGS_DIR}/pkg`) return ["index.d.ts", "dist-types"];
      return [];
    });
    await run(
      {
        pkg: makeIsopack({
          typesEntry: "pkg.d.ts",
          resources: [makeResource("pkg.d.ts", "export const x: 1;")],
        }),
      },
      ["pkg"]
    );
    expect(files.rm_recursive).toHaveBeenCalledWith(
      `${PKGS_DIR}/pkg/dist-types`
    );
  });

  test("colon-named package: stub specifier uses the normalized name", async () => {
    const isopack = makeIsopack({
      typesDir: "dist-types",
      typesEntry: "dist-types/index.d.ts",
      resources: [
        makeResource("dist-types/index.d.ts", "export const x: 1;\n"),
      ],
    });
    await run({ "author:package": isopack }, ["author:package"]);
    expect(writtenContentAt(`${PKGS_DIR}/author_package/index.d.ts`)).toBe(
      "declare module 'meteor/author:package' {\n" +
        "  import exports = require('meteor-package-types/author_package/dist-types/index');\n" +
        "  export = exports;\n" +
        "}\n"
    );
  });

  test("entry with its own declare-module blocks gets a reference shim, not a stub", async () => {
    const AMBIENT =
      "declare module 'meteor/pkg' {\n  export const x: number;\n}\n";
    const isopack = makeIsopack({
      typesDir: "dist-types",
      typesEntry: "dist-types/index.d.ts",
      resources: [makeResource("dist-types/index.d.ts", AMBIENT)],
    });
    await run({ pkg: isopack }, ["pkg"]);
    // the copied file stays verbatim…
    expect(writtenContentAt(`${PKGS_DIR}/pkg/dist-types/index.d.ts`)).toBe(
      AMBIENT
    );
    // …and index.d.ts is a triple-slash reference shim: an ambient-only
    // file is a script, so a require() stub cannot resolve it (TS2306),
    // and the stub's `export =` would merge into the same ambient module
    // id and clobber the entry's real exports (TS2305 on every import).
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toBe(
      '/// <reference path="./dist-types/index.d.ts" />\n'
    );
    // the barrel references only the shim — the shim loads the ambient
    // file transitively, so no extra dist-types reference is needed.
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain('/// <reference path="./packages/pkg/index.d.ts" />');
    expect(dts).not.toContain("dist-types");
  });

  test("sub-path module file with its own declare-module blocks gets a reference shim", async () => {
    const AMBIENT_SUB =
      "declare module 'meteor/pkg/hooks' {\n" +
      "  export function useThing(): number;\n" +
      "}\n";
    const isopack = makeIsopack({
      typesDir: "dist-types",
      typesEntry: "dist-types/index.d.ts",
      typesModules: { hooks: "dist-types/hooks.d.ts" },
      resources: [
        makeResource("dist-types/index.d.ts", "export const x: 1;\n"),
        makeResource("dist-types/hooks.d.ts", AMBIENT_SUB),
      ],
    });
    await run({ pkg: isopack }, ["pkg"]);
    // plain entry keeps the require() stub…
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toContain(
      "import exports = require('meteor-package-types/pkg/dist-types/index');"
    );
    // …while the ambient sub-path module file gets the reference shim
    expect(writtenContentAt(`${PKGS_DIR}/pkg/module-hooks.d.ts`)).toBe(
      '/// <reference path="./dist-types/hooks.d.ts" />\n'
    );
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/pkg/module-hooks.d.ts" />'
    );
  });

  test("skips the package when the entry is not among the folder's files", async () => {
    const isopack = makeIsopack({
      typesDir: "dist-types",
      typesEntry: "dist-types/missing.d.ts",
      resources: [
        makeResource("dist-types/other.d.ts", "export const x: 1;\n"),
      ],
    });
    await run({ pkg: isopack }, ["pkg"]);
    expect(writtenContentAt(PACKAGES_DTS)).not.toContain("meteor/pkg");
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toBeNull();
  });

  test("skips a sub-path module whose file is not in the folder", async () => {
    const isopack = makeIsopack({
      typesDir: "dist-types",
      typesEntry: "dist-types/index.d.ts",
      typesModules: { ghost: "dist-types/ghost.d.ts" },
      resources: [
        makeResource("dist-types/index.d.ts", "export const x: 1;\n"),
      ],
    });
    await run({ pkg: isopack }, ["pkg"]);
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain('/// <reference path="./packages/pkg/index.d.ts" />');
    expect(dts).not.toContain("ghost");
    expect(writtenContentAt(`${PKGS_DIR}/pkg/ghost.d.ts`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ts-src mode (api.types('index.ts') — TypeScript-authored packages)
// ---------------------------------------------------------------------------

describe("ts-src mode – TypeScript-authored isopack.typesEntry", () => {
  const INDEX_TS =
    "import { helper } from './lib/helper';\n" +
    "export const x: number = helper();\n";
  const HELPER_TS = "export function helper(): number { return 1; }\n";
  const AMBIENT_DTS = "declare const AmbientThing: string;\n";
  const HOOKS_TS = "export function useThing(): number { return 2; }\n";

  const PKG_DIR = `${PKGS_DIR}/my-package`;
  const TYPES_NM_DIR = `${TYPES_DIR}/node_modules`;
  const PKG_TYPES_LINK = `${TYPES_NM_DIR}/meteor-package-types`;

  const MAIN_STUB =
    "declare module 'meteor/my-package' {\n" +
    "  import exports = require('meteor-package-types/my-package/src/index');\n" +
    "  export = exports;\n" +
    "}\n";

  const HOOKS_STUB =
    "declare module 'meteor/my-package/hooks' {\n" +
    "  import exports = require('meteor-package-types/my-package/src/client/hooks');\n" +
    "  export = exports;\n" +
    "}\n";

  function tsIsopack() {
    return makeIsopack({
      typesEntry: "index.ts",
      typesModules: { hooks: "client/hooks.ts" },
      resources: [
        makeSourceResource("index.ts", INDEX_TS),
        makeSourceResource("lib/helper.ts", HELPER_TS),
        makeSourceResource("client/hooks.ts", HOOKS_TS),
        // a registered declaration-file asset rides along
        makeResource("ambient.d.ts", AMBIENT_DTS),
        // non-TypeScript resources must NOT be copied
        makeSourceResource("plain.js", "exports.y = 1;\n"),
        makeResource("logo.png", "not-really-a-png"),
      ],
    });
  }

  async function run(isopacks, names) {
    await generateTypes({
      isopackCache: makeIsopackCache(isopacks),
      packageMap: makePackageMap(names),
      projectMeteorDir: PROJECT_METEOR,
    });
  }

  test("copies the TypeScript sources under src/ with a @ts-nocheck banner, tree preserved", async () => {
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    // implementation sources get the banner: they are type-checked with
    // the consuming APP's compiler flags (skipLibCheck only exempts
    // .d.ts), so package internals must not fail the app's typecheck
    expect(writtenContentAt(`${PKG_DIR}/src/index.ts`)).toBe(
      `// @ts-nocheck\n${INDEX_TS}`
    );
    expect(writtenContentAt(`${PKG_DIR}/src/lib/helper.ts`)).toBe(
      `// @ts-nocheck\n${HELPER_TS}`
    );
    expect(writtenContentAt(`${PKG_DIR}/src/client/hooks.ts`)).toBe(
      `// @ts-nocheck\n${HOOKS_TS}`
    );
    // declaration-file assets are copied VERBATIM (skipLibCheck covers them)
    expect(writtenContentAt(`${PKG_DIR}/src/ambient.d.ts`)).toBe(AMBIENT_DTS);
    // nested directories are created
    expect(files.mkdir_p).toHaveBeenCalledWith(`${PKG_DIR}/src/lib`);
    expect(files.mkdir_p).toHaveBeenCalledWith(`${PKG_DIR}/src/client`);
  });

  test("does not double-prefix a source that already starts with @ts-nocheck", async () => {
    const NOCHECKED = "// @ts-nocheck\nexport const x = 1;\n";
    const isopack = makeIsopack({
      typesEntry: "index.ts",
      resources: [makeSourceResource("index.ts", NOCHECKED)],
    });
    await run({ pkg: isopack }, ["pkg"]);
    expect(writtenContentAt(`${PKGS_DIR}/pkg/src/index.ts`)).toBe(NOCHECKED);
  });

  test("does not copy non-TypeScript resources", async () => {
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    expect(writtenContentAt(`${PKG_DIR}/src/plain.js`)).toBeNull();
    expect(writtenContentAt(`${PKG_DIR}/src/logo.png`)).toBeNull();
  });

  test("writes an extensionless bare-specifier stub as index.d.ts (exact content)", async () => {
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    expect(writtenContentAt(`${PKG_DIR}/index.d.ts`)).toBe(MAIN_STUB);
  });

  test("writes a stub per sub-path module, pointing at the copied source", async () => {
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    expect(writtenContentAt(`${PKG_DIR}/module-hooks.d.ts`)).toBe(HOOKS_STUB);
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/my-package/index.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/my-package/module-hooks.d.ts" />'
    );
  });

  test("a .tsx entry strips only the trailing extension", async () => {
    const isopack = makeIsopack({
      typesEntry: "ui/main.tsx",
      resources: [
        makeSourceResource("ui/main.tsx", "export const el: any = null;\n"),
      ],
    });
    await run({ pkg: isopack }, ["pkg"]);
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toBe(
      "declare module 'meteor/pkg' {\n" +
        "  import exports = require('meteor-package-types/pkg/src/ui/main');\n" +
        "  export = exports;\n" +
        "}\n"
    );
  });

  test("colon-named package: stub specifier uses the normalized name", async () => {
    const isopack = makeIsopack({
      typesEntry: "index.ts",
      resources: [makeSourceResource("index.ts", "export const x = 1;\n")],
    });
    await run({ "author:package": isopack }, ["author:package"]);
    expect(writtenContentAt(`${PKGS_DIR}/author_package/index.d.ts`)).toBe(
      "declare module 'meteor/author:package' {\n" +
        "  import exports = require('meteor-package-types/author_package/src/index');\n" +
        "  export = exports;\n" +
        "}\n"
    );
  });

  test("creates the meteor-package-types symlink at the types root", async () => {
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    expect(files.mkdir_p).toHaveBeenCalledWith(TYPES_NM_DIR);
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(
      PKGS_DIR,
      PKG_TYPES_LINK
    );
    expect(files.__symlinks.get(PKG_TYPES_LINK)).toBe(PKGS_DIR);
  });

  test("stale cleanup keeps src/ and the stubs, prunes dropped files", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["my-package"];
      if (p === PKG_DIR) {
        return [
          "index.d.ts",
          "module-hooks.d.ts",
          "src",
          "dropped-module.d.ts",
          "node_modules",
        ];
      }
      return [];
    });
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    expect(files.rm_recursive).toHaveBeenCalledWith(
      `${PKG_DIR}/dropped-module.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(`${PKG_DIR}/src`);
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${PKG_DIR}/index.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${PKG_DIR}/module-hooks.d.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${PKG_DIR}/node_modules`
    );
  });

  test("prunes stale files nested inside src/, keeping current sources", async () => {
    files.readdir.mockImplementation((p) => {
      if (p === PKGS_DIR) return ["my-package"];
      if (p === PKG_DIR) return ["index.d.ts", "module-hooks.d.ts", "src"];
      return [];
    });
    files.readdirWithTypes.mockImplementation((p) => {
      if (p === `${PKG_DIR}/src`) {
        return [
          dirent("index.ts"),
          dirent("ambient.d.ts"),
          dirent("stale.ts"),
          dirent("lib", true),
          dirent("client", true),
        ];
      }
      if (p === `${PKG_DIR}/src/lib`) {
        return [dirent("helper.ts")];
      }
      if (p === `${PKG_DIR}/src/client`) {
        return [dirent("hooks.ts"), dirent("removed.tsx")];
      }
      return [];
    });
    await run({ "my-package": tsIsopack() }, ["my-package"]);
    expect(files.unlink).toHaveBeenCalledWith(`${PKG_DIR}/src/stale.ts`);
    expect(files.unlink).toHaveBeenCalledWith(
      `${PKG_DIR}/src/client/removed.tsx`
    );
    expect(files.unlink).not.toHaveBeenCalledWith(`${PKG_DIR}/src/index.ts`);
    expect(files.unlink).not.toHaveBeenCalledWith(
      `${PKG_DIR}/src/lib/helper.ts`
    );
    expect(files.unlink).not.toHaveBeenCalledWith(
      `${PKG_DIR}/src/client/hooks.ts`
    );
    expect(files.rm_recursive).not.toHaveBeenCalledWith(`${PKG_DIR}/src`);
    expect(files.rm_recursive).not.toHaveBeenCalledWith(
      `${PKG_DIR}/src/client`
    );
  });

  test("skips the package when the entry is not among its TypeScript sources", async () => {
    const isopack = makeIsopack({
      typesEntry: "missing.ts",
      resources: [makeSourceResource("other.ts", "export const x = 1;\n")],
    });
    await run({ pkg: isopack }, ["pkg"]);
    expect(writtenContentAt(PACKAGES_DTS)).not.toContain("meteor/pkg");
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toBeNull();
    // nothing was copied either
    expect(writtenContentAt(`${PKGS_DIR}/pkg/src/other.ts`)).toBeNull();
    // the skip is a visible warning (publish succeeds for this
    // misconfiguration, so a silent debug line would hide the divergence)
    expect(Console.warn).toHaveBeenCalledWith(
      expect.stringContaining('api.types("missing.ts")')
    );
  });

  test("skips a sub-path module whose file is not among the sources", async () => {
    const isopack = makeIsopack({
      typesEntry: "index.ts",
      typesModules: { ghost: "ghost.ts" },
      resources: [makeSourceResource("index.ts", "export const x = 1;\n")],
    });
    await run({ pkg: isopack }, ["pkg"]);
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain('/// <reference path="./packages/pkg/index.d.ts" />');
    expect(dts).not.toContain("ghost");
    expect(writtenContentAt(`${PKGS_DIR}/pkg/ghost.d.ts`)).toBeNull();
  });

  test("a .d.ts typesEntry uses single-file mode rather than ts-src", async () => {
    const isopack = makeIsopack({
      typesEntry: "types.d.ts",
      resources: [makeResource("types.d.ts", "export declare const x: 1;")],
    });
    await run({ pkg: isopack }, ["pkg"]);
    // Adapter plus private declaration, no src/ copy.
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toContain(
      "declare module 'meteor/pkg'"
    );
    expect(
      writtenContentAt(`${PKGS_DIR}/pkg/declarations/index.d.ts`)
    ).toBe("export declare const x: 1;");
    expect(writtenContentAt(`${PKGS_DIR}/pkg/src/types.d.ts`)).toBeNull();
    expect(files.symlinkWithOverwrite).toHaveBeenCalledWith(
      PKGS_DIR,
      PKG_TYPES_LINK
    );
  });

  test("typesDir takes precedence over a .ts entry (publish-rewritten package)", async () => {
    // After `meteor publish` rewrites a TS-authored package, typesDir is set
    // and typesEntry points at generated declarations — plain directory mode.
    const isopack = makeIsopack({
      typesDir: ".types-build",
      typesEntry: ".types-build/index.d.ts",
      resources: [
        makeResource(".types-build/index.d.ts", "export declare const x: 1;\n"),
      ],
    });
    await run({ pkg: isopack }, ["pkg"]);
    expect(writtenContentAt(`${PKGS_DIR}/pkg/index.d.ts`)).toBe(
      "declare module 'meteor/pkg' {\n" +
        "  import exports = require('meteor-package-types/pkg/.types-build/index');\n" +
        "  export = exports;\n" +
        "}\n"
    );
    expect(writtenContentAt(`${PKGS_DIR}/pkg/src/index.d.ts`)).toBeNull();
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
    expect(writtenContentAt(`${PKGS_DIR}/pkg/module-sub.d.ts`)).toBe(`${sub}\n`);
  });

  test("adapts files with top-level namespaces and non-relative imports", async () => {
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
    expect(perPkg).toContain("declare module 'meteor/random'");
    const privateModule = writtenContentAt(
      `${PKGS_DIR}/random/declarations/index.d.ts`
    );
    expect(privateModule).toContain("import { Mongo } from 'meteor/mongo';");
    expect(privateModule).toContain("export namespace Random {");
  });

  test("loads exports from a mixed external module and augmentation", async () => {
    const content = [
      "import { Meteor } from 'meteor/meteor';",
      "declare module 'meteor/meteor' {",
      "  namespace Meteor {",
      "    interface User { twoFactorEnabled?: boolean; }",
      "  }",
      "}",
      "export declare function generateToken(userId: string): string;",
    ].join("\n");
    const isopack = makeIsopack({
      typesEntry: "accounts-2fa.d.ts",
      resources: [makeResource("accounts-2fa.d.ts", content)],
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ "accounts-2fa": isopack }),
      packageMap: makePackageMap(["accounts-2fa"]),
      projectMeteorDir: PROJECT_METEOR,
    });

    expect(
      compileGenerated(
        [
          "import { generateToken } from 'meteor/accounts-2fa';",
          "import { Meteor } from 'meteor/meteor';",
          "generateToken('user-id');",
          "({} as Meteor.User).twoFactorEnabled;",
        ].join("\n"),
        {
          "/proj/meteor.d.ts": [
            "declare module 'meteor/meteor' {",
            "  export namespace Meteor { interface User {} }",
            "}",
          ].join("\n"),
        }
      )
    ).toEqual([]);
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
    expect(
      writtenContentAt(
        `${PKGS_DIR}/author_package/declarations/index.d.ts`
      )
    ).toBe(content);
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
    const slashPkg = writtenContentAt(`${PKGS_DIR}/pkg/module-a_sb.d.ts`);
    expect(slashPkg).toContain("declare module 'meteor/pkg/a/b'");
    expect(
      writtenContentAt(`${PKGS_DIR}/pkg/declarations/module-a_sb.d.ts`)
    ).toBe(SLASH);
    const underscorePkg = writtenContentAt(`${PKGS_DIR}/pkg/module-a_u_ub.d.ts`);
    expect(underscorePkg).toContain("declare module 'meteor/pkg/a__b'");
    expect(
      writtenContentAt(`${PKGS_DIR}/pkg/declarations/module-a_u_ub.d.ts`)
    ).toBe(UNDERSCORE);
    // barrel references both distinct files
    const dts = writtenContentAt(PACKAGES_DTS);
    expect(dts).toContain(
      '/// <reference path="./packages/pkg/module-a_sb.d.ts" />'
    );
    expect(dts).toContain(
      '/// <reference path="./packages/pkg/module-a_u_ub.d.ts" />'
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
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalledWith(NPM_DIR, LINK);
  });

  test("skips the symlink when the isopack does not know its on-disk root", async () => {
    files.exists.mockImplementation(() => true);
    await run(randomIsopack({ isopackPath: null }));
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalledWith(NPM_DIR, LINK);
  });

  test("leaves an existing symlink with the correct target alone", async () => {
    files.exists.mockImplementation((p) => p === NPM_DIR);
    files.__symlinks.set(LINK, NPM_DIR);
    await run(randomIsopack());
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalledWith(NPM_DIR, LINK);
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
    expect(files.symlinkWithOverwrite).not.toHaveBeenCalledWith(NPM_DIR, LINK);
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
    const adapter =
      "declare module 'meteor/random' {\n" +
      "  import exports = require('meteor-package-types/random/declarations/index');\n" +
      "  export = exports;\n" +
      "}\n";
    files.readFile.mockImplementation((p) => {
      if (p === `${PKGS_DIR}/random/index.d.ts`) {
        return Buffer.from(adapter);
      }
      if (p === `${PKGS_DIR}/random/declarations/index.d.ts`) {
        return Buffer.from(content);
      }
      throw enoent();
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    const perPkgWrites = files.writeFile.mock.calls.filter(
      (c) =>
        c[0] === `${PKGS_DIR}/random/index.d.ts` ||
        c[0] === `${PKGS_DIR}/random/declarations/index.d.ts`
    );
    expect(perPkgWrites).toHaveLength(0);
  });

  test("writes the private module when declaration content changes", async () => {
    const oldContent = "export declare const old: string;";
    const newContent = "export declare const newer: string;";
    const isopack = makeIsopack({
      typesEntry: "random.d.ts",
      resources: [makeResource("random.d.ts", newContent)],
    });
    files.readFile.mockImplementation((p) => {
      if (p === `${PKGS_DIR}/random/declarations/index.d.ts`) {
        return Buffer.from(oldContent);
      }
      throw enoent();
    });
    await generateTypes({
      isopackCache: makeIsopackCache({ random: isopack }),
      packageMap: makePackageMap(["random"]),
      projectMeteorDir: PROJECT_METEOR,
    });
    expect(
      writtenContentAt(`${PKGS_DIR}/random/declarations/index.d.ts`)
    ).toBe(newContent);
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
