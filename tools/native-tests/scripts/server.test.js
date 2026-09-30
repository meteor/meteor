const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildServerArgs,
  buildServerEnv,
  resolveLanIp,
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

test("passes the LAN URL explicitly as Meteor's mobile server", () => {
  assert.deepEqual(
    buildServerArgs({ lanIp: "192.0.2.10", port: 3100 }),
    [
      "run",
      "--port",
      "192.0.2.10:3100",
      "--mobile-server",
      "http://192.0.2.10:3100",
    ]
  );
});

test("forces the Cordova web architecture for the HCP server", () => {
  assert.deepEqual(buildServerEnv({ PATH: "/bin" }), {
    PATH: "/bin",
    METEOR_FORCE_INCLUDE_ARCHS: "web.cordova",
  });
});
