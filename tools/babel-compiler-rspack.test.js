const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

const compilerSource = fs.readFileSync(
  path.join(__dirname, "../packages/babel-compiler/babel-compiler.js"),
  "utf8",
);

function compileRspackOutput(rspackHelpers, {
  arch = "web.browser",
  source = "already compiled",
  sourceMap = { version: 3, sources: ["app.js"], mappings: "AAAA" },
} = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-rspack-map-"));
  const outputPath = path.join(directory, "app-rspack.js");
  const error = jest.fn();

  if (sourceMap) {
    fs.writeFileSync(`${outputPath}.map`, JSON.stringify(sourceMap));
  }
  const mapHash = sourceMap && crypto.createHash("sha1")
    .update(JSON.stringify(sourceMap)).digest("hex");
  const readAndWatchFileWithHash = jest.fn((_path, { hashOnly } = {}) => ({
    hash: mapHash,
    contents: sourceMap && !hashOnly
      ? fs.readFileSync(`${outputPath}.map`) : null,
  }));

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
      readAndWatchFileWithHash,
    };

    return {
      result: compiler.processOneFileForTarget(inputFile, source),
      sourceMap,
      mapHash,
      readAndWatchFileWithHash,
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
  const { result, mapPath, mapHash, error } = compileRspackOutput(
    { createFileBackedSourceMap },
    { arch: "web.browser.legacy", source },
  );

  expect(result.data).toBe(source);
  expect(result.sourceMap).toEqual({ path: mapPath, hash: mapHash });
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
  const { result, error, mapPath, mapHash } = compileRspackOutput({
    createFileBackedSourceMap,
  });

  expect(result.sourceMap).toEqual({ path: mapPath, hash: mapHash });
  expect(createFileBackedSourceMap).toHaveBeenCalledWith(mapPath);
  expect(error).not.toHaveBeenCalled();
});


test.each([false, true])("map-only edits invalidate Rspack output hashes (file-backed: %s)", fileBacked => {
  const helpers = fileBacked ? {
    createFileBackedSourceMap: mapPath => ({ path: mapPath }),
  } : {};
  const before = compileRspackOutput(helpers);
  const after = compileRspackOutput(helpers, {
    sourceMap: { version: 3, sources: ["app.js"], mappings: "AACA" },
  });

  expect(before.result.data).toBe(after.result.data);
  expect(before.result.hash).not.toBe(after.result.hash);
  expect(after.readAndWatchFileWithHash).toHaveBeenCalledWith(after.mapPath, {
    hashOnly: fileBacked,
  });
  expect(before.error).not.toHaveBeenCalled();
  expect(after.error).not.toHaveBeenCalled();
});

test("missing Rspack maps stay watched without creating a file-backed reference", () => {
  const createFileBackedSourceMap = jest.fn();
  const { result, mapPath, readAndWatchFileWithHash, error } = compileRspackOutput(
    { createFileBackedSourceMap }, { sourceMap: null },
  );
  expect(result.sourceMap).toBeNull();
  expect(result.hash).toBe("source-hash");
  expect(createFileBackedSourceMap).not.toHaveBeenCalled();
  expect(readAndWatchFileWithHash).toHaveBeenCalledWith(mapPath, { hashOnly: true });
  expect(error).not.toHaveBeenCalled();
});
