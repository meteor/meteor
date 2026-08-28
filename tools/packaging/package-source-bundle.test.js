"use strict";

jest.mock("../fs/files", () => ({}));

const { addTypeDeclarationSources } = require("./package-source-bundle");

function dir(name) {
  return {
    name,
    isDirectory: () => true,
    isFile: () => false,
  };
}

function file(name) {
  return {
    name,
    isDirectory: () => false,
    isFile: () => true,
  };
}

function makeFiles(directoryEntries) {
  return {
    pathJoin: (...parts) => parts.join("/"),
    pathResolve: (...parts) => parts.join("/").replace("/./", "/"),
    pathRelative: (root, target) => target.slice(root.length + 1),
    containsPath: (root, target) => target.startsWith(root + "/"),
    convertToStandardPath: (path) => path,
    readdirWithTypes: (path) => {
      if (!(path in directoryEntries)) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
      }
      return directoryEntries[path];
    },
  };
}

describe("package source declaration collection", () => {
  test("recursively adds declarations and maps but not compiler state", () => {
    const fileSystem = makeFiles({
      "/package/.types-build": [
        file("index.d.ts"),
        file("index.d.ts.map"),
        file(".tsbuildinfo"),
        dir("client"),
      ],
      "/package/.types-build/client": [file("hooks.d.ts"), file("hooks.js")],
    });

    const result = addTypeDeclarationSources({
      packageDir: "/package",
      typesDir: ".types-build",
      sourceFiles: ["package.js", ".types-build/index.d.ts"],
      fileSystem,
    });

    expect(result).toEqual({
      ok: true,
      declarationSources: [
        ".types-build/client/hooks.d.ts",
        ".types-build/index.d.ts",
        ".types-build/index.d.ts.map",
      ],
      sourceFiles: [
        "package.js",
        ".types-build/index.d.ts",
        ".types-build/client/hooks.d.ts",
        ".types-build/index.d.ts.map",
      ],
    });
  });

  test("rejects a declaration directory outside the package root", () => {
    const fileSystem = makeFiles({});
    fileSystem.pathResolve = () => "/outside/types";

    const result = addTypeDeclarationSources({
      packageDir: "/package",
      typesDir: "../outside/types",
      sourceFiles: ["package.js"],
      fileSystem,
    });

    expect(result).toEqual({
      ok: false,
      error:
        'api.types(): declaration directory "../outside/types" resolves outside the package root.',
    });
  });

  test("rejects a missing or empty declaration directory", () => {
    const missing = addTypeDeclarationSources({
      packageDir: "/package",
      typesDir: ".types-build",
      sourceFiles: [],
      fileSystem: makeFiles({}),
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toContain('declaration directory ".types-build"');

    const empty = addTypeDeclarationSources({
      packageDir: "/package",
      typesDir: ".types-build",
      sourceFiles: [],
      fileSystem: makeFiles({ "/package/.types-build": [file("README.md")] }),
    });
    expect(empty).toEqual({
      ok: false,
      error: 'api.types(): declaration directory ".types-build" contains no .d.ts files.',
    });
  });

  test("leaves source lists unchanged for packages without directory types", () => {
    const result = addTypeDeclarationSources({
      packageDir: "/package",
      typesDir: null,
      sourceFiles: ["package.js"],
      fileSystem: makeFiles({}),
    });

    expect(result).toEqual({
      ok: true,
      declarationSources: [],
      sourceFiles: ["package.js"],
    });
  });
});
