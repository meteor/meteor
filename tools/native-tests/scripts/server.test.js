const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildNativeRunOptions,
  buildServerRunOptions,
  resolveLanIp,
  resolveNativeServerConfig,
} = require("./server");

test("returns a non-loopback IPv4 address", () => {
  const ip = resolveLanIp();
  assert.match(ip, /^\d+\.\d+\.\d+\.\d+$/);
  assert.notEqual(ip, "127.0.0.1");
  assert.notEqual(ip, "0.0.0.0");
});

test("prefers the supplied interface name when present", () => {
  const fakeInterfaces = {
    "en0": [
      { family: "IPv4", address: "10.0.0.5", internal: false },
    ],
    "lo0": [
      { family: "IPv4", address: "127.0.0.1", internal: true },
    ],
  };
  const ip = resolveLanIp({ interfaces: fakeInterfaces, prefer: "en0" });
  assert.equal(ip, "10.0.0.5");
});

test("falls back to first non-loopback IPv4 when prefer is missing", () => {
  const fakeInterfaces = {
    "eth0": [
      { family: "IPv4", address: "172.20.0.4", internal: false },
    ],
  };
  const ip = resolveLanIp({ interfaces: fakeInterfaces, prefer: "en0" });
  assert.equal(ip, "172.20.0.4");
});

test("builds capacitor meteor run command and env for a device target", () => {
  const options = buildNativeRunOptions({
    platform: "android",
    bindHost: "127.0.0.1",
    mobileServerUrl: "http://10.0.2.2:3210",
    port: 3210,
    deviceId: "emulator-5554",
    baseEnv: { EXISTING: "1", NO_COLOR: "1", FORCE_COLOR: "1" },
    meteorBin: "/repo/meteor",
  });

  assert.equal(options.command, "/repo/meteor");
  assert.deepEqual(options.args, [
    "run",
    "android",
    "--port",
    "127.0.0.1:3210",
    "--mobile-server",
    "http://10.0.2.2:3210",
  ]);
  assert.equal(options.env.EXISTING, "1");
  assert.equal(options.env.PORT, "3210");
  assert.equal(options.env.ROOT_URL, "http://127.0.0.1:3210");
  assert.equal(options.env.METEOR_CAPACITOR_LOCAL_IP, "127.0.0.1");
  assert.equal(options.env.METEOR_CAPACITOR_TARGET, "emulator-5554");
  assert.equal(options.env.DO_NOT_TRACK, "1");
  assert.equal("NO_COLOR" in options.env, false);
  assert.equal("FORCE_COLOR" in options.env, false);
});

test("passes explicit Capacitor mode through the environment", () => {
  const options = buildNativeRunOptions({
    platform: "ios",
    bindHost: "10.0.0.6",
    mobileServerUrl: "http://10.0.0.6:3211",
    port: 3211,
    capacitorMode: "livereload",
    baseEnv: {},
    meteorBin: "/repo/meteor",
  });

  assert.deepEqual(options.args, [
    "run",
    "ios",
    "--port",
    "10.0.0.6:3211",
    "--mobile-server",
    "http://10.0.0.6:3211",
  ]);
  assert.equal(options.env.METEOR_CAPACITOR_MODE, "livereload");
  assert.equal(options.env.METEOR_CAPACITOR_LOCAL_IP, "10.0.0.6");
  assert.equal(options.env.ROOT_URL, "http://10.0.0.6:3211");
  assert.equal(options.env.DO_NOT_TRACK, "1");
});

test("builds local server command with package stats disabled", () => {
  const options = buildServerRunOptions({
    bindHost: "10.0.0.7",
    mobileServerUrl: "http://10.0.0.7:3212",
    port: 3212,
    baseEnv: { EXISTING: "1", NO_COLOR: "1", FORCE_COLOR: "1" },
    meteorBin: "/repo/meteor",
  });

  assert.equal(options.command, "/repo/meteor");
  assert.deepEqual(options.args, [
    "run",
    "--port",
    "10.0.0.7:3212",
    "--mobile-server",
    "http://10.0.0.7:3212",
  ]);
  assert.equal(options.env.EXISTING, "1");
  assert.equal(options.env.PORT, "3212");
  assert.equal(options.env.ROOT_URL, "http://10.0.0.7:3212");
  assert.equal(options.env.DO_NOT_TRACK, "1");
  assert.equal("NO_COLOR" in options.env, false);
  assert.equal("FORCE_COLOR" in options.env, false);
  assert.equal(options.url, "http://10.0.0.7:3212");
});

test("android emulator server config separates bind host from mobile server url", () => {
  const config = resolveNativeServerConfig({
    platform: "android",
    lanIp: "192.168.1.10",
    port: 3000,
  });

  assert.deepEqual(config, {
    bindHost: "127.0.0.1",
    bindUrl: "http://127.0.0.1:3000",
    mobileServerUrl: "http://10.0.2.2:3000",
    lanIp: "192.168.1.10",
    port: 3000,
  });
});

test("ios simulator server config keeps lan ip for bind and mobile server url", () => {
  const config = resolveNativeServerConfig({
    platform: "ios",
    lanIp: "192.168.1.11",
    port: 3001,
  });

  assert.deepEqual(config, {
    bindHost: "192.168.1.11",
    bindUrl: "http://192.168.1.11:3001",
    mobileServerUrl: "http://192.168.1.11:3001",
    lanIp: "192.168.1.11",
    port: 3001,
  });
});
