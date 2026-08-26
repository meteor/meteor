"use strict";

/**
 * Unit tests for the api.types() validation in tools/isobuild/package-api.js.
 *
 * PackageAPI is deliberately filesystem-free, so the heavy build-system
 * imports are mocked away and the validation logic is exercised directly.
 */

jest.mock("../utils/buildmessage.js", () => ({
  error: jest.fn(),
}));

jest.mock("../utils/utils.js", () => ({
  parsePackageConstraint: jest.fn(),
}));

jest.mock("./compiler.js", () => ({
  ALL_ARCHES: ["os", "web.browser", "web.browser.legacy", "web.cordova"],
}));

jest.mock("../utils/archinfo", () => ({
  matches: jest.fn(() => true),
  mapWhereToArches: jest.fn((where) => [where]),
}));

jest.mock("../packaging/catalog/catalog.js", () => ({
  DEFAULT_TRACK: "METEOR",
}));

jest.mock("../fs/files", () => ({
  pathRelative: (from, to) => to.replace(/^\.\//, ""),
  convertToPosixPath: (p) => p.replace(/\\\\/g, "/"),
}));

const buildmessage = require("../utils/buildmessage.js");
const { PackageAPI } = require("./package-api.js");

function makeApi() {
  return new PackageAPI();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("api.types() input validation", () => {
  test("rejects a non-string path without throwing", () => {
    const api = makeApi();

    expect(() => api.types(null)).not.toThrow();
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("requires a non-empty path"),
      expect.anything()
    );
  });

  test.each(["README.md", "types.json", "index.js"])(
    "rejects an unsupported single-file extension: %s",
    (entry) => {
      const api = makeApi();

      api.types(entry);

      expect(buildmessage.error).toHaveBeenCalledWith(
        expect.stringContaining(".d.ts or .ts/.tsx"),
        expect.anything()
      );
      expect(api._typesEntry).toBeNull();
      expect(api._typesModules).toBeNull();
    }
  );

  test("rejects non-declaration modules in declaration mode without partial metadata", () => {
    const api = makeApi();

    api.types("index.d.ts", { modules: { notes: "notes.txt" } });

    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must be a .d.ts path"),
      expect.anything()
    );
    expect(api._typesEntry).toBeNull();
    expect(api._typesModules).toBeNull();
  });

  test("rejects declaration modules in TypeScript-source mode", () => {
    const api = makeApi();

    api.types("index.ts", { modules: { hooks: "hooks.d.ts" } });

    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must be a .ts/.tsx source path"),
      expect.anything()
    );
    expect(api._typesEntry).toBeNull();
    expect(api._typesModules).toBeNull();
  });

  test.each(["", ".", "..", "nested//hooks", "nested\\hooks"])(
    "rejects an invalid module sub-path name: %j",
    (name) => {
      const api = makeApi();

      api.types("index.d.ts", { modules: { [name]: "hooks.d.ts" } });

      expect(buildmessage.error).toHaveBeenCalledWith(
        expect.stringContaining("valid non-empty sub-path"),
        expect.anything()
      );
      expect(api._typesEntry).toBeNull();
      expect(api._typesModules).toBeNull();
    }
  );
});

describe("api.types() directory-path validation", () => {
  function expectRejected(api) {
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("is not a valid directory path"),
      expect.anything()
    );
    expect(api._typesDir).toBeNull();
  }

  test("accepts a plain directory with a trailing slash", () => {
    const api = makeApi();
    api.types("dist-types/");
    expect(buildmessage.error).not.toHaveBeenCalled();
    expect(api._typesDir).toBe("dist-types");
  });

  test("accepts a './'-prefixed directory", () => {
    const api = makeApi();
    api.types("./dist-types/");
    expect(buildmessage.error).not.toHaveBeenCalled();
    expect(api._typesDir).toBe("dist-types");
  });

  test("rejects './' (the package root)", () => {
    const api = makeApi();
    api.types("./");
    expectRejected(api);
  });

  test("rejects '.'-segments inside the path ('dist/./')", () => {
    const api = makeApi();
    api.types("dist/./");
    expectRejected(api);
  });

  test("rejects '..' segments", () => {
    const api = makeApi();
    api.types("../dist-types/");
    expectRejected(api);
  });

  test("rejects empty segments ('dist//types/')", () => {
    const api = makeApi();
    api.types("dist//types/");
    expectRejected(api);
  });
});

describe("api.types() directory-mode entry/modules validation", () => {
  test("rejects a non-declaration options.entry", () => {
    const api = makeApi();
    api.types("dist-types/", { entry: "main.ts" });
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must be a .d.ts path"),
      expect.anything()
    );
    expect(api._typesDir).toBeNull();
    expect(api._typesEntry).toBeNull();
  });

  test("rejects a non-declaration options.modules value", () => {
    const api = makeApi();
    api.types("dist-types/", { modules: { notes: "notes.txt" } });
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must be a .d.ts path"),
      expect.anything()
    );
    expect(api._typesDir).toBeNull();
    expect(api._typesModules).toBeNull();
  });

  test("rejects '.'-segments in options.entry", () => {
    const api = makeApi();
    api.types("dist-types/", { entry: "./sub/./main.d.ts" });
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must stay inside"),
      expect.anything()
    );
    expect(api._typesDir).toBeNull();
  });

  test("rejects '.' as options.entry", () => {
    const api = makeApi();
    api.types("dist-types/", { entry: "." });
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must stay inside"),
      expect.anything()
    );
  });

  test("rejects '.'-segments in options.modules values", () => {
    const api = makeApi();
    api.types("dist-types/", { modules: { sub: "sub/./mod.d.ts" } });
    expect(buildmessage.error).toHaveBeenCalledWith(
      expect.stringContaining("must stay inside"),
      expect.anything()
    );
    expect(api._typesDir).toBeNull();
  });

  test("still accepts './'-prefixed entry and module paths", () => {
    const api = makeApi();
    api.types("dist-types/", {
      entry: "./server/main.d.ts",
      modules: { hooks: "./client/hooks.d.ts" },
    });
    expect(buildmessage.error).not.toHaveBeenCalled();
    expect(api._typesDir).toBe("dist-types");
    expect(api._typesEntry).toBe("dist-types/server/main.d.ts");
    expect(api._typesModules).toEqual({
      hooks: "dist-types/client/hooks.d.ts",
    });
  });
});

describe("api.types() Windows paths", () => {
  test("normalizes declaration entry and module paths", () => {
    const api = makeApi();
    api.types("types\\\\index.d.ts", {
      modules: { sub: "types\\\\sub.d.ts" },
    });

    expect(buildmessage.error).not.toHaveBeenCalled();
    expect(api._typesEntry).toBe("types/index.d.ts");
    expect(api._typesModules).toEqual({ sub: "types/sub.d.ts" });
  });

  test("recognizes a trailing backslash as directory mode", () => {
    const api = makeApi();
    api.types("dist-types\\\\", {
      entry: ".\\\\server\\\\main.d.ts",
      modules: { hooks: ".\\\\client\\\\hooks.d.ts" },
    });

    expect(buildmessage.error).not.toHaveBeenCalled();
    expect(api._typesDir).toBe("dist-types");
    expect(api._typesEntry).toBe("dist-types/server/main.d.ts");
    expect(api._typesModules).toEqual({
      hooks: "dist-types/client/hooks.d.ts",
    });
  });
});
