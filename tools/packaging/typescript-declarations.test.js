"use strict";

jest.mock("../fs/files", () => ({
  exists: jest.fn(),
  pathJoin: (...parts) => parts.join("/"),
}));

const files = require("../fs/files");
const {
  TYPES_BUILD_DIR,
  declarationPathForSource,
  usePrebuiltTypeScriptDeclarations,
} = require("./typescript-declarations");

describe("prebuilt TypeScript declarations", () => {
  beforeEach(() => {
    files.exists.mockReset();
  });

  test("maps TypeScript entry and modules into the generated directory", () => {
    files.exists.mockReturnValue(true);
    const packageSource = {
      typesEntry: "./index.ts",
      typesModules: {
        hooks: "./client/hooks.tsx",
        utilities: "utilities.ts",
      },
      typesDir: null,
    };

    const result = usePrebuiltTypeScriptDeclarations(packageSource, "/package");

    expect(result).toEqual({ ok: true, missing: [] });
    expect(packageSource.typesDir).toBe(TYPES_BUILD_DIR);
    expect(packageSource.typesEntry).toBe(".types-build/index.d.ts");
    expect(packageSource.typesModules).toEqual({
      hooks: ".types-build/client/hooks.d.ts",
      utilities: ".types-build/utilities.d.ts",
    });
    expect(files.exists).toHaveBeenCalledWith("/package/.types-build/client/hooks.d.ts");
  });

  test("does not mutate metadata when any expected declaration is missing", () => {
    files.exists.mockImplementation((path) => !path.endsWith("hooks.d.ts"));
    const originalModules = { hooks: "client/hooks.ts" };
    const packageSource = {
      typesEntry: "index.ts",
      typesModules: originalModules,
      typesDir: null,
    };

    const result = usePrebuiltTypeScriptDeclarations(packageSource, "/package");

    expect(result).toEqual({
      ok: false,
      missing: [
        {
          label: "modules.hooks",
          sourcePath: "client/hooks.ts",
          declarationPath: ".types-build/client/hooks.d.ts",
        },
      ],
    });
    expect(packageSource).toEqual({
      typesEntry: "index.ts",
      typesModules: originalModules,
      typesDir: null,
    });
  });

  test("reports a missing entry using its normalized source path", () => {
    files.exists.mockReturnValue(false);
    const packageSource = {
      typesEntry: "./src/index.tsx",
      typesModules: null,
      typesDir: null,
    };

    const result = usePrebuiltTypeScriptDeclarations(packageSource, "/package");

    expect(result.missing).toEqual([
      {
        label: "entry",
        sourcePath: "src/index.tsx",
        declarationPath: ".types-build/src/index.d.ts",
      },
    ]);
    expect(packageSource.typesEntry).toBe("./src/index.tsx");
    expect(packageSource.typesDir).toBeNull();
  });

  test("maps only the trailing ts or tsx extension", () => {
    expect(declarationPathForSource("src/types.ts/index.tsx")).toBe(
      ".types-build/src/types.ts/index.d.ts",
    );
  });
});
