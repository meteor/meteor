const os = require("node:os");
const path = require("node:path");
const execa = require("execa");
const waitOn = require("wait-on");
const { buildNativeTestEnv } = require("./env");

const DEFAULT_PORT = 3000;

function resolveNativeServerConfig({
  platform,
  lanIp,
  port = DEFAULT_PORT,
  env = process.env,
} = {}) {
  const isAndroid = platform === "android";
  const bindHost = isAndroid
    ? (env.MAESTRO_ANDROID_BIND_HOST || "127.0.0.1")
    : lanIp;
  const mobileServerHost = isAndroid
    ? (env.MAESTRO_ANDROID_MOBILE_SERVER_HOST || "10.0.2.2")
    : bindHost;

  return {
    bindHost,
    bindUrl: `http://${bindHost}:${port}`,
    mobileServerUrl: `http://${mobileServerHost}:${port}`,
    lanIp,
    port,
  };
}

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

function buildNativeRunOptions({
  platform,
  bindHost,
  lanIp,
  mobileServerUrl,
  port = DEFAULT_PORT,
  deviceId,
  capacitorMode,
  baseEnv = process.env,
  meteorBin,
} = {}) {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const meteor = meteorBin || path.join(repoRoot, "meteor");
  const host = bindHost || lanIp;
  const url = `http://${host}:${port}`;
  const env = buildNativeTestEnv(baseEnv, {
    DO_NOT_TRACK: "1",
    PORT: String(port),
    ROOT_URL: url,
    METEOR_CAPACITOR_LOCAL_IP: host,
  });

  if (capacitorMode) {
    env.METEOR_CAPACITOR_MODE = capacitorMode;
  }

  if (deviceId) {
    env.METEOR_CAPACITOR_TARGET = deviceId;
  }

  return {
    command: meteor,
    args: [
      "run",
      platform,
      "--port",
      `${host}:${port}`,
      ...(mobileServerUrl ? ["--mobile-server", mobileServerUrl] : []),
    ],
    env,
    url,
  };
}

function buildServerRunOptions({
  bindHost,
  lanIp,
  mobileServerUrl,
  port = DEFAULT_PORT,
  baseEnv = process.env,
  meteorBin,
} = {}) {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const meteor = meteorBin || path.join(repoRoot, "meteor");
  const host = bindHost || lanIp;
  const url = `http://${host}:${port}`;
  return {
    command: meteor,
    args: [
      "run",
      "--port",
      `${host}:${port}`,
      ...(mobileServerUrl ? ["--mobile-server", mobileServerUrl] : []),
    ],
    env: buildNativeTestEnv(baseEnv, {
      DO_NOT_TRACK: "1",
      PORT: String(port),
      ROOT_URL: url,
    }),
    url,
  };
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
async function startServer({
  appDir,
  bindHost,
  lanIp,
  mobileServerUrl,
  port = 3000,
  meteorBin,
}) {
  const { command, args, env, url } = buildServerRunOptions({
    bindHost,
    lanIp,
    mobileServerUrl,
    port,
    meteorBin,
  });

  const child = execa(
    command,
    args,
    {
      cwd: appDir,
      env,
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

async function startNativeRun({
  appDir,
  platform,
  bindHost,
  lanIp,
  mobileServerUrl,
  port = DEFAULT_PORT,
  deviceId,
  capacitorMode,
  meteorBin,
}) {
  const { command, args, env, url } = buildNativeRunOptions({
    platform,
    bindHost,
    lanIp,
    mobileServerUrl,
    port,
    deviceId,
    capacitorMode,
    meteorBin,
  });

  const child = execa(
    command,
    args,
    {
      cwd: appDir,
      env,
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

module.exports = {
  buildNativeRunOptions,
  buildServerRunOptions,
  resolveLanIp,
  resolveNativeServerConfig,
  startNativeRun,
  startServer,
};
