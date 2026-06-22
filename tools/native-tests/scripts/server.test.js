const test = require("node:test");
const assert = require("node:assert/strict");
const { buildNativeRunOptions, resolveLanIp } = require("./server");

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
    lanIp: "10.0.0.5",
    port: 3210,
    deviceId: "emulator-5554",
    baseEnv: { EXISTING: "1" },
    meteorBin: "/repo/meteor",
  });

  assert.equal(options.command, "/repo/meteor");
  assert.deepEqual(options.args, ["run", "android", "--port", "10.0.0.5:3210"]);
  assert.equal(options.env.EXISTING, "1");
  assert.equal(options.env.PORT, "3210");
  assert.equal(options.env.ROOT_URL, "http://10.0.0.5:3210");
  assert.equal(options.env.METEOR_CAPACITOR_LOCAL_IP, "10.0.0.5");
  assert.equal(options.env.METEOR_CAPACITOR_TARGET, "emulator-5554");
});

test("passes explicit Capacitor mode into meteor run env", () => {
  const options = buildNativeRunOptions({
    platform: "ios",
    lanIp: "10.0.0.6",
    port: 3211,
    capacitorMode: "livereload",
    baseEnv: {},
    meteorBin: "/repo/meteor",
  });

  assert.equal(options.env.METEOR_CAPACITOR_MODE, "livereload");
  assert.equal(options.env.METEOR_CAPACITOR_LOCAL_IP, "10.0.0.6");
  assert.equal(options.env.ROOT_URL, "http://10.0.0.6:3211");
});
