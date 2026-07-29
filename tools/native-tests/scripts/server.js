const os = require("node:os");
const path = require("node:path");
const execa = require("execa");
const waitOn = require("wait-on");

function resolveLanIp({ interfaces = os.networkInterfaces(), prefer } = {}) {
  const flat = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === "IPv4" && !addr.internal) {
        flat.push({ name, address: addr.address });
      }
    }
  }
  if (!flat.length) {
    throw new Error("No non-loopback IPv4 interface found");
  }
  if (prefer) {
    const preferred = flat.find((entry) => entry.name === prefer);
    if (preferred) return preferred.address;
  }
  return flat[0].address;
}

/**
 * Start `meteor run` for the smoke app on the chosen LAN IP.
 *
 * @param {object} opts
 * @param {string} opts.appDir   Absolute path to the Meteor app source.
 * @param {string} opts.lanIp    IPv4 address the server should bind to.
 * @param {number} [opts.port]   Defaults to 3000.
 * @param {string} [opts.meteorBin]  Path to the meteor launcher. Defaults to ./meteor at the repo root.
 * @returns {Promise<{stop: () => Promise<void>, url: string}>}
 */
async function startServer({ appDir, lanIp, port = 3000, meteorBin }) {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const meteor = meteorBin || path.join(repoRoot, "meteor");
  const url = `http://${lanIp}:${port}`;

  const child = execa(
    meteor,
    ["run", "--port", `${lanIp}:${port}`],
    {
      cwd: appDir,
      stdio: "inherit",
      reject: false,
      detached: false,
    }
  );

  await waitOn({ resources: [url], timeout: 240_000, interval: 1000 });

  return {
    url,
    async stop() {
      if (child.pid && !child.killed) {
        child.kill("SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!child.killed) child.kill("SIGKILL");
      }
    },
  };
}

module.exports = { resolveLanIp, startServer };
