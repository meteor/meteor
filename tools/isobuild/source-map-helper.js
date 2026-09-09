import assert from "assert";
import { spawn } from "child_process";
import files from "../fs/files";
import {
  createFileBackedSourceMap,
  isFileBackedSourceMap,
} from "../utils/file-backed-source-map";

const PROTOCOL_VERSION = 1;
const RECIPE_VERSION = 1;
const RECIPE_KEY = "$meteorSourceMapRecipe";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const HELPER_TIMEOUT_MS = 10 * 60 * 1000;
const EXECUTABLE_NAME = process.platform === "win32"
  ? "meteor-source-map-helper.exe"
  : "meteor-source-map-helper";

/**
 * Describes linker chunks without decoding their source maps in V8.
 * Recipes never cross Meteor's public compiler-plugin boundary.
 */
export function createSourceMapRecipe(pieces) {
  return {
    [RECIPE_KEY]: RECIPE_VERSION,
    pieces,
  };
}

export function isSourceMapRecipe(value) {
  return value?.[RECIPE_KEY] === RECIPE_VERSION &&
    Array.isArray(value.pieces);
}

function findHelper() {
  const candidates = [
    process.env.METEOR_SOURCE_MAP_HELPER,
    files.pathJoin(files.pathDirname(process.execPath), EXECUTABLE_NAME),
    files.pathJoin(
      files.getCurrentToolsDir(),
      "tools",
      "source-map-helper",
      "target",
      "release",
      EXECUTABLE_NAME,
    ),
    files.pathJoin(
      files.getCurrentToolsDir(),
      "tools",
      "source-map-helper",
      "target",
      "debug",
      EXECUTABLE_NAME,
    ),
  ].filter(Boolean);

  const helper = candidates.find(candidate => files.exists(candidate));
  if (!helper) {
    throw new Error(
      `Could not find ${EXECUTABLE_NAME}. Rebuild the Meteor dev bundle ` +
      "or set METEOR_SOURCE_MAP_HELPER to its absolute path.",
    );
  }

  return helper;
}

async function invokeHelper(request) {
  const child = spawn(findHelper(), [], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, HELPER_TIMEOUT_MS);

  child.stdout.on("data", chunk => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAX_RESPONSE_BYTES) child.kill();
    stdout.push(chunk);
  });
  child.stderr.on("data", chunk => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAX_RESPONSE_BYTES) child.kill();
    stderr.push(chunk);
  });

  child.stdin.end(JSON.stringify(request));
  const { code, signal } = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(timeout));
  const output = Buffer.concat(stdout).toString("utf8");
  const errors = Buffer.concat(stderr).toString("utf8");

  if (stdoutBytes > MAX_RESPONSE_BYTES || stderrBytes > MAX_RESPONSE_BYTES) {
    throw new Error("Source-map helper exceeded its response size limit");
  }
  if (timedOut) {
    throw new Error(`Source-map helper timed out after ${HELPER_TIMEOUT_MS}ms`);
  }
  if (code !== 0) {
    let detail = output || errors || `signal ${signal}`;
    try {
      detail = JSON.parse(output).error || detail;
    } catch (_) {
      // Preserve non-JSON diagnostics from process startup failures.
    }
    throw new Error(`Source-map helper failed: ${detail}`);
  }

  return JSON.parse(output);
}

/**
 * Materializes a linker recipe through the bounded-memory Rust engine.
 */
export async function composeSourceMapRecipe(recipe, {
  file = null,
  sourcePrefix = null,
} = {}) {
  assert.strictEqual(isSourceMapRecipe(recipe), true);

  const workspaceRoot = files.mkdtemp("meteor-source-map-");
  const inputRoots = new Set([workspaceRoot]);
  const pieces = [];
  let mappedIndex = 0;

  for (const piece of recipe.pieces) {
    if (typeof piece === "string") {
      pieces.push({ kind: "literal", value: piece });
      continue;
    }

    assert.strictEqual(typeof piece.code, "string");
    const codePath = files.pathJoin(workspaceRoot, `input-${mappedIndex}.js`);
    const mapPath = isFileBackedSourceMap(piece.map)
      ? piece.map.path
      : files.pathJoin(workspaceRoot, `input-${mappedIndex}.js.map`);

    files.writeFile(codePath, piece.code, "utf8");
    if (isFileBackedSourceMap(piece.map)) {
      inputRoots.add(files.pathDirname(piece.map.path));
    } else {
      const mapText = typeof piece.map === "string"
        ? piece.map
        : JSON.stringify(piece.map);
      files.writeFile(mapPath, mapText, "utf8");
    }

    pieces.push({
      kind: "mapped",
      codePath,
      mapPath,
      relativePath: piece.relativePath || undefined,
    });
    mappedIndex += 1;
  }

  const codePath = files.pathJoin(workspaceRoot, "output.js");
  const mapPath = files.pathJoin(workspaceRoot, "output.js.map");
  const response = await invokeHelper({
    protocolVersion: PROTOCOL_VERSION,
    workspaceRoot,
    inputRoots: Array.from(inputRoots),
    output: { codePath, mapPath, file, sourcePrefix },
    pieces,
  });
  assert.strictEqual(response.protocolVersion, PROTOCOL_VERSION);
  assert.strictEqual(response.success, true);
  assert.strictEqual(response.codePath, codePath);
  assert.strictEqual(response.mapPath, mapPath);

  const code = files.readFile(codePath, "utf8");

  return {
    code,
    map: createFileBackedSourceMap({
      path: mapPath,
      byteLength: response.mapBytes,
      file,
      hash: response.mapSha256,
    }),
  };
}
