const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const compilerSource = fs.readFileSync(
  path.join(__dirname, "../packages/babel-compiler/babel-compiler.js"),
  "utf8",
);

function compileRspackOutput(rspackHelpers, { arch = "web.browser", source = "already compiled" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-rspack-map-"));
  const outputPath = path.join(directory, "app-rspack.js");
  const sourceMap = { version: 3, sources: ["app.js"], mappings: "AAAA" };
  const error = jest.fn();

  fs.writeFileSync(`${outputPath}.map`, JSON.stringify(sourceMap));

  try {
    const context = {
      console: { error },
      Npm: {
        require(name) {
          return name === "json5" ? {} : require(name);
        },
      },
      Plugin: {
        getMeteorConfig: () => ({}),
        rspackHelpers: {
          isRspackOutputFile: () => true,
          ...rspackHelpers,
        },
      },
      process,
    };

    vm.runInNewContext(compilerSource, context);

    const compiler = new context.BabelCompiler({});
    const inputFile = {
      getPackageName: () => null,
      getPathInPackage: () => outputPath,
      getFileOptions: () => ({ transpile: false }),
      getSourceHash: () => "source-hash",
      getArch: () => arch,
    };

    return {
      result: compiler.processOneFileForTarget(inputFile, source),
      sourceMap,
      error,
      mapPath: `${outputPath}.map`,
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("Rspack output uses JSON source maps with older Meteor tools", () => {
  const { result, sourceMap, error } = compileRspackOutput({});

  expect(result.data).toBe("already compiled");
  expect(result.sourceMap).toEqual(sourceMap);
  expect(error).not.toHaveBeenCalled();
});

test("legacy target accepts Rspack output marked as compatible", () => {
  const source = "var answer = 42;\n/* meteor-rspack-legacy-compatible */";
  const createFileBackedSourceMap = jest.fn(mapPath => ({ path: mapPath }));
  const { result, mapPath, error } = compileRspackOutput(
    { createFileBackedSourceMap },
    { arch: "web.browser.legacy", source },
  );

  expect(result.data).toBe(source);
  expect(result.sourceMap).toEqual({ path: mapPath });
  expect(createFileBackedSourceMap).toHaveBeenCalledWith(mapPath);
  expect(error).not.toHaveBeenCalled();
});

test("legacy target does not bypass unmarked Rspack output", () => {
  const createFileBackedSourceMap = jest.fn();
  const { result } = compileRspackOutput(
    { createFileBackedSourceMap },
    { arch: "web.browser.legacy" },
  );

  expect(result.sourceMap).toBeNull();
  expect(createFileBackedSourceMap).not.toHaveBeenCalled();
});

test("Rspack output uses file-backed source maps when the helper exists", () => {
  const createFileBackedSourceMap = jest.fn(mapPath => ({ path: mapPath }));
  const { result, error, mapPath } = compileRspackOutput({
    createFileBackedSourceMap,
  });

  expect(result.sourceMap).toEqual({ path: mapPath });
  expect(createFileBackedSourceMap).toHaveBeenCalledWith(mapPath);
  expect(error).not.toHaveBeenCalled();
});
