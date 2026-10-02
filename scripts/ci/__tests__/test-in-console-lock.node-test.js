const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const source = path.resolve(
  __dirname,
  "../../../packages/test-in-console/run.sh"
);

function writeExecutable(file, contents) {
  fs.writeFileSync(file, contents, { mode: 0o755 });
}

function fixture(t, { browserAvailable = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "test-in-console-lock-"));
  const packageDir = path.join(root, "packages/test-in-console");
  const puppeteerDir = path.join(root, "dev_bundle/lib/node_modules/puppeteer");
  const binDir = path.join(root, "bin");
  const tmpDir = path.join(root, "tmp");
  const lock = path.join(tmpDir, "puppeteer-chrome-cache-25.9.0.lock");

  for (const dir of [packageDir, puppeteerDir, binDir, tmpDir, path.join(root, "dev_bundle/bin")]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(source, path.join(packageDir, "run.sh"));
  fs.symlinkSync(process.execPath, path.join(root, "dev_bundle/bin/node"));
  fs.writeFileSync(path.join(puppeteerDir, "package.json"), '{"version":"25.9.0"}');
  fs.writeFileSync(
    path.join(puppeteerDir, "index.js"),
    `exports.executablePath = () => ${JSON.stringify(path.join(root, "fake-chrome"))};\n`
  );
  if (browserAvailable) {
    writeExecutable(path.join(root, "fake-chrome"), "#!/bin/sh\nexit 0\n");
  }
  fs.writeFileSync(
    path.join(puppeteerDir, "install.mjs"),
    "await new Promise(resolve => setTimeout(resolve, 3000));\n"
  );
  fs.writeFileSync(path.join(packageDir, "puppeteer_runner.js"), "");
  writeExecutable(
    path.join(root, "meteor"),
    '#!/bin/bash\nif [ "${1:-}" = "--version" ]; then exit 0; fi\nif [ "${1:-}" = "test-packages" ]; then echo "test-in-console listening"; /bin/sleep 2; exit 0; fi\nexit 1\n'
  );
  writeExecutable(path.join(binDir, "curl"), "#!/bin/sh\nexit 0\n");
  writeExecutable(
    path.join(binDir, "sleep"),
    '#!/bin/sh\nif [ "${1:-}" = "30" ]; then exec /bin/sleep 0.05; fi\nexec /bin/sleep "$@"\n'
  );

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    lock,
    script: path.join(packageDir, "run.sh"),
    env: { ...process.env, TMPDIR: tmpDir, TEST_PORT: "43333", PATH: `${binDir}:${process.env.PATH}` },
  };
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for fixture state");
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

test("a fresh lock with a dead owner does not block the next job", (t) => {
  const { root, lock, script, env } = fixture(t);
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, "pid"), "999999999\n");

  const result = spawnSync("bash", [script, "ddp-server"], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 6000,
  });

  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(lock), false);
});

test("cancelling an installer does not leave a heartbeat renewing its lock", async (t) => {
  const { root, lock, script, env } = fixture(t, { browserAvailable: false });
  const child = spawn("bash", [script, "ddp-server"], {
    cwd: root,
    env,
    stdio: "ignore",
  });

  t.after(() => {
    try { process.kill(child.pid, "SIGKILL"); } catch {}
  });

  await waitFor(() => fs.existsSync(path.join(lock, "pid")));
  await new Promise(resolve => setTimeout(resolve, 100));
  process.kill(child.pid, "SIGKILL");
  await waitFor(() => !fs.existsSync(lock), 5000);
});
