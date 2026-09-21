#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROTOCOL_VERSION = 1;

function loadSourceMap() {
  const candidates = [
    process.env.METEOR_SOURCE_MAP_NODE_MODULE,
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/source-map"),
    path.resolve(__dirname, "../../dev_bundle/lib/node_modules/source-map"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }

  throw new Error("Could not resolve source-map@0.7.4 for the Node helper");
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateInputPath(roots, inputPath) {
  const canonical = fs.realpathSync(inputPath);
  if (!roots.some(root => isWithin(root, canonical))) {
    throw new Error(`input path ${inputPath} is outside the allowed roots`);
  }
}

function validateOutputPath(root, outputPath) {
  let existing = path.dirname(outputPath);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error(`output path ${outputPath} has no existing ancestor`);
    existing = parent;
  }

  if (!isWithin(root, fs.realpathSync(existing))) {
    throw new Error(`output path ${outputPath} is outside workspace`);
  }
}

function stripXssiPrefix(value) {
  return value.startsWith(")]}'") ? value.slice(value.indexOf("\n") + 1) : value;
}

function rewriteSource(source, prefix) {
  if (!prefix || source.startsWith(prefix)) return source;

  return `${prefix}${source.startsWith("/") ? "" : "/"}${source}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function execute(request) {
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `unsupported protocol version ${request.protocolVersion}; expected ${PROTOCOL_VERSION}`,
    );
  }

  const workspaceRoot = fs.realpathSync(request.workspaceRoot);
  const inputRoots = [workspaceRoot, ...(request.inputRoots || []).map(root => fs.realpathSync(root))];

  validateOutputPath(workspaceRoot, request.output.codePath);
  validateOutputPath(workspaceRoot, request.output.mapPath);

  const { SourceMapConsumer, SourceNode } = loadSourceMap();
  const output = new SourceNode();
  const consumers = [];

  try {
    for (const piece of request.pieces) {
      if (piece.kind === "literal") {
        output.add(piece.value);
        continue;
      }
      if (piece.kind !== "mapped") throw new Error(`unsupported piece kind ${piece.kind}`);

      validateInputPath(inputRoots, piece.codePath);
      validateInputPath(inputRoots, piece.mapPath);

      const code = fs.readFileSync(piece.codePath, "utf8");
      const map = stripXssiPrefix(fs.readFileSync(piece.mapPath, "utf8"));
      const consumer = await new SourceMapConsumer(map);
      consumers.push(consumer);
      output.add(SourceNode.fromStringWithSourceMap(code, consumer, piece.relativePath));
    }

    const result = output.toStringWithSourceMap({ file: request.output.file || undefined });
    const map = result.map.toJSON();
    if (request.output.sourcePrefix) {
      map.sources = map.sources.map(source => rewriteSource(source, request.output.sourcePrefix));
    }

    const codeText = result.code;
    const mapText = JSON.stringify(map);
    fs.mkdirSync(path.dirname(request.output.codePath), { recursive: true });
    fs.mkdirSync(path.dirname(request.output.mapPath), { recursive: true });
    fs.writeFileSync(request.output.codePath, codeText);
    fs.writeFileSync(request.output.mapPath, mapText);

    return {
      protocolVersion: PROTOCOL_VERSION,
      success: true,
      codePath: request.output.codePath,
      mapPath: request.output.mapPath,
      codeBytes: Buffer.byteLength(codeText),
      mapBytes: Buffer.byteLength(mapText),
      codeSha256: sha256(codeText),
      mapSha256: sha256(mapText),
    };
  } finally {
    for (const consumer of consumers) consumer.destroy();
  }
}

async function main() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);

    const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    process.stdout.write(`${JSON.stringify(await execute(request))}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      success: false,
      error: error.stack || String(error),
    })}\n`);
    process.exitCode = 1;
  }
}

main();
