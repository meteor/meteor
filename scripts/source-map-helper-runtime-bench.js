#!/usr/bin/env node

const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SAMPLE_INTERVAL_MS = 250;
const DEFAULT_EXCLUDED_ARCHS = "web.browser.legacy,web.cordova";

const app = path.resolve(process.env.APP || process.cwd());
const meteor = path.resolve(process.env.METEOR || path.join(__dirname, "../meteor"));
const helper = process.env.METEOR_SOURCE_MAP_HELPER;
const label = process.env.LABEL || "runtime";
const modules = Number.parseInt(process.env.MODULES || "400", 10);
const functionsPerModule = Number.parseInt(process.env.FUNCS || "400", 10);
const heapMB = Number.parseInt(process.env.HEAP || "2048", 10);
const mode = process.env.MODE || "debug";
const resultsRoot = path.resolve(process.env.RESULTS || "/tmp/meteor-source-map-results");

if (!helper) throw new Error("METEOR_SOURCE_MAP_HELPER must name the helper executable");
if (!Number.isSafeInteger(modules) || modules <= 0) throw new Error("MODULES must be positive");
if (!Number.isSafeInteger(functionsPerModule) || functionsPerModule <= 0) {
  throw new Error("FUNCS must be positive");
}
if (!Number.isSafeInteger(heapMB) || heapMB <= 0) throw new Error("HEAP must be positive");
if (!new Set(["debug", "production"]).has(mode)) throw new Error("MODE must be debug or production");

function processRows() {
  const output = execFileSync("ps", ["-A", "-ww", "-o", "pid=,ppid=,rss=,command="], {
    encoding: "utf8",
  });

  return output.trim().split("\n").map(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) return null;

    return {
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      rssKB: Number(match[3]),
      command: match[4],
    };
  }).filter(Boolean);
}

function descendants(rootPid, rows) {
  const selected = new Set([rootPid]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const row of rows) {
      if (selected.has(row.parentPid) && !selected.has(row.pid)) {
        selected.add(row.pid);
        changed = true;
      }
    }
  }

  return rows.filter(row => selected.has(row.pid));
}

function updatePeaks(peaks, rootPid) {
  let rows;
  try {
    rows = descendants(rootPid, processRows());
  } catch {
    return;
  }

  const tool = rows.find(row => row.command.includes("tools/index.js"));
  const helperRows = rows.filter(row =>
    row.command.includes("meteor-source-map-helper")
  );
  const helperRSS = helperRows.reduce((total, row) => total + row.rssKB, 0);
  const treeRSS = rows.reduce((total, row) => total + row.rssKB, 0);

  peaks.toolKB = Math.max(peaks.toolKB, tool?.rssKB || 0);
  peaks.helperKB = Math.max(peaks.helperKB, helperRSS);
  peaks.treeKB = Math.max(peaks.treeKB, treeRSS);
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

function findArtifact(programRoot, suffix) {
  const pending = [programRoot];
  let largest = null;
  let largestBytes = -1;

  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      if (entry.isFile() && entry.name.endsWith(suffix)) {
        const bytes = fs.statSync(candidate).size;
        if (bytes > largestBytes) {
          largest = candidate;
          largestBytes = bytes;
        }
      }
    }
  }

  return largest;
}

function artifact(file) {
  if (!file) return null;

  return {
    path: file,
    bytes: fs.statSync(file).size,
    sha256: sha256(file),
  };
}

async function main() {
  fs.mkdirSync(resultsRoot, { recursive: true });
  execFileSync(process.execPath, [path.join(app, "generate.js")], {
    cwd: app,
    env: { ...process.env, MODULES: String(modules), FUNCS: String(functionsPerModule) },
    stdio: "inherit",
  });

  const output = path.join(resultsRoot, `${label}-${modules}x${functionsPerModule}-${mode}`);
  const logPath = `${output}.log`;
  fs.rmSync(output, { recursive: true, force: true });
  fs.rmSync(path.join(app, ".meteor/local"), { recursive: true, force: true });
  fs.rmSync(path.join(app, "_build"), { recursive: true, force: true });
  fs.rmSync(path.join(app, "node_modules/.cache"), { recursive: true, force: true });

  const args = ["build", "--directory", output];
  if (mode === "debug") args.push("--debug");
  const log = fs.openSync(logPath, "w");
  const startedAt = Date.now();
  const child = spawn(meteor, args, {
    cwd: app,
    env: {
      ...process.env,
      METEOR_SOURCE_MAP_HELPER: helper,
      METEOR_FORCE_EXCLUDE_ARCHS: process.env.EXCLUDE_ARCHS || DEFAULT_EXCLUDED_ARCHS,
      TOOL_NODE_FLAGS: `--max-old-space-size=${heapMB}`,
      METEOR_PROFILE: "1",
    },
    stdio: ["ignore", log, log],
  });
  const peaks = { toolKB: 0, helperKB: 0, treeKB: 0 };
  const sampler = setInterval(() => updatePeaks(peaks, child.pid), SAMPLE_INTERVAL_MS);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });

  clearInterval(sampler);
  updatePeaks(peaks, child.pid);
  fs.closeSync(log);

  const programRoot = path.join(output, "bundle/programs/web.browser");
  const result = {
    label,
    workload: `${modules}x${functionsPerModule}`,
    mode,
    meteor,
    helper: path.resolve(helper),
    heapMB,
    completed: exitCode === 0,
    exitCode,
    wallSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(3)),
    peakRSSMB: {
      meteor: Math.round(peaks.toolKB / 1024),
      helper: Math.round(peaks.helperKB / 1024),
      processTree: Math.round(peaks.treeKB / 1024),
    },
    javascript: fs.existsSync(programRoot) ? artifact(findArtifact(programRoot, ".js")) : null,
    sourceMap: fs.existsSync(programRoot) ? artifact(findArtifact(programRoot, ".js.map")) : null,
    log: logPath,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
