#!/usr/bin/env node

const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SAMPLE_INTERVAL_MS = 100;
const MAX_CAPTURE_BYTES = 1024 * 1024;

const helper = path.resolve(process.env.METEOR_SOURCE_MAP_HELPER || "");
const codePath = path.resolve(process.env.CODE || "");
const mapPath = path.resolve(process.env.MAP || `${codePath}.map`);
const label = process.env.LABEL || path.basename(helper);

if (!process.env.METEOR_SOURCE_MAP_HELPER) throw new Error("METEOR_SOURCE_MAP_HELPER is required");
if (!process.env.CODE) throw new Error("CODE is required");

function rssKB(pid) {
  try {
    return Number(execFileSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim()) || 0;
  } catch {
    return 0;
  }
}

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);

  try {
    let count;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(descriptor);
  }

  return hash.digest("hex");
}

async function main() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "meteor-helper-bench-"));
  const outputCode = path.join(workspaceRoot, "output.js");
  const outputMap = path.join(workspaceRoot, "output.js.map");
  const request = {
    protocolVersion: 1,
    workspaceRoot,
    inputRoots: [...new Set([path.dirname(codePath), path.dirname(mapPath)])],
    output: { codePath: outputCode, mapPath: outputMap, file: "app.js" },
    pieces: [
      { kind: "literal", value: "function module(require,exports,module){\n\n" },
      { kind: "mapped", codePath, mapPath },
      { kind: "literal", value: "\n}" },
    ],
  };
  const startedAt = Date.now();
  const child = spawn(helper, [], { stdio: ["pipe", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let peakRSSKB = 0;
  const sampler = setInterval(() => {
    peakRSSKB = Math.max(peakRSSKB, rssKB(child.pid));
  }, SAMPLE_INTERVAL_MS);

  child.stdout.on("data", chunk => {
    stdoutBytes += chunk.length;
    if (stdoutBytes <= MAX_CAPTURE_BYTES) stdout.push(chunk);
  });
  child.stderr.on("data", chunk => {
    stderrBytes += chunk.length;
    if (stderrBytes <= MAX_CAPTURE_BYTES) stderr.push(chunk);
  });
  child.stdin.end(JSON.stringify(request));

  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  clearInterval(sampler);
  peakRSSKB = Math.max(peakRSSKB, rssKB(child.pid));

  const completed = exit.code === 0 && fs.existsSync(outputCode) && fs.existsSync(outputMap);
  let response = null;
  try {
    response = JSON.parse(Buffer.concat(stdout).toString("utf8"));
  } catch {
    response = { error: Buffer.concat(stderr).toString("utf8") || "invalid helper response" };
  }

  const result = {
    label,
    helper,
    input: {
      codeBytes: fs.statSync(codePath).size,
      mapBytes: fs.statSync(mapPath).size,
    },
    completed,
    exit,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    peakRSSMB: Math.round(peakRSSKB / 1024),
    output: completed ? {
      codeBytes: fs.statSync(outputCode).size,
      mapBytes: fs.statSync(outputMap).size,
      codeSha256: sha256(outputCode),
      mapSha256: sha256(outputMap),
    } : null,
    error: completed ? null : response?.error,
  };

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
