const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const findPort = require("../../../packages/test-in-console/find-port");

function listen(port = 0) {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("test port selection skips an occupied adjacent Mongo port", async () => {
  const candidate = await findPort();
  const mongo = await listen(candidate + 1);
  try {
    const selected = await findPort(candidate);
    assert.notEqual(selected, candidate);
    const selectedHttp = await listen(selected);
    try {
      const selectedMongo = await listen(selected + 1);
      await close(selectedMongo);
    } finally {
      await close(selectedHttp);
    }
  } finally {
    await close(mongo);
  }
});

test("test port selection skips an occupied HTTP port", async () => {
  const http = await listen();
  try {
    assert.notEqual(await findPort(http.address().port), http.address().port);
  } finally {
    await close(http);
  }
});

for (const exitCode of [0, 7]) {
  test(
    `package runner drains output and stops its launcher after driver exit ${exitCode}`,
    {
      timeout: 20000,
    },
    async (t) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "meteor-console-runner-"));
      let runner;
      let launcherPid;
      try {
        const driverDir = path.join(root, "packages/test-in-console");
        const nodeDir = path.join(root, "dev_bundle/bin");
        const puppeteerDir = path.join(root, "dev_bundle/lib/node_modules/puppeteer");
        await Promise.all(
          [driverDir, nodeDir, puppeteerDir].map((dir) => fs.mkdir(dir, { recursive: true })),
        );
        const sourceDir = path.resolve(__dirname, "../../../packages/test-in-console");
        for (const file of ["run.sh", "find-port.js"]) {
          await fs.copyFile(path.join(sourceDir, file), path.join(driverDir, file));
        }
        await fs.symlink(process.execPath, path.join(nodeDir, "node"));
        // Satisfy browser preflight without downloading or launching a browser.
        // The real shell runner still starts and stops a real server process.
        await fs.writeFile(
          path.join(puppeteerDir, "package.json"),
          JSON.stringify({
            version: "25.9.0",
            main: "index.js",
          }),
        );
        await fs.writeFile(
          path.join(puppeteerDir, "index.js"),
          "exports.executablePath = () => process.execPath;\n",
        );
        await fs.writeFile(
          path.join(root, "meteor"),
          `#!/usr/bin/env node
if (process.argv[2] === '--version') process.exit(0);
require('node:fs').writeFileSync('launcher.pid', String(process.pid));
const port = Number(process.argv[process.argv.indexOf('-p') + 1]);
const server = require('node:http').createServer((_req, res) => res.end('ready'));
server.listen(port, '127.0.0.1', () => {
  console.log('test-in-console listening');
});
const logging = setInterval(() => console.log('output after readiness'), 20);
process.once('SIGTERM', () => {
  clearInterval(logging);
  server.close(() => setTimeout(() => {
    console.log('launcher shutdown complete');
    process.exit(0);
  }, 100));
});
`,
          { mode: 0o755 },
        );
        await fs.writeFile(
          path.join(driverDir, "puppeteer_runner.js"),
          `
fetch(process.env.URL).then(async response => {
  if (await response.text() !== 'ready') process.exit(99);
  setTimeout(() => process.exit(${exitCode}), 100);
}).catch(() => process.exit(98));
`,
        );

        runner = spawn("bash", [path.join(driverDir, "run.sh"), "ddp-client"], {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${nodeDir}:${process.env.PATH}`,
            TMPDIR: root,
            TEST_PORT: "",
          },
          stdio: ["ignore", "pipe", "pipe"],
          signal: t.signal,
        });
        let output = "";
        runner.stdout.on("data", (data) => {
          output += data;
        });
        runner.stderr.on("data", (data) => {
          output += data;
        });
        const result = await new Promise((resolve, reject) => {
          runner.once("error", reject);
          runner.once("close", (code, signal) => resolve({ code, signal }));
        });
        launcherPid = Number(await fs.readFile(path.join(root, "launcher.pid"), "utf8"));
        assert.deepEqual(result, { code: exitCode, signal: null }, output);
        assert.match(output, /output after readiness/);
        assert.match(output, /launcher shutdown complete/);
        assert.doesNotMatch(output, /EPIPE/);
        assert.throws(() => process.kill(launcherPid, 0), { code: "ESRCH" });
      } finally {
        // Also clean up the fixture when testing an older, leaking runner.
        if (!launcherPid) {
          launcherPid = Number(
            await fs.readFile(path.join(root, "launcher.pid"), "utf8").catch(() => 0),
          );
        }
        if (launcherPid) {
          try {
            process.kill(launcherPid, "SIGKILL");
          } catch {}
        }
        if (runner && runner.exitCode === null) runner.kill("SIGKILL");
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
}
