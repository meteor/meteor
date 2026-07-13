const { ProvidePlugin } = require("@rspack/core");
const meteorNodeStubs = require("meteor-node-stubs");

const TEST_CLIENT_NODE_POLYFILLS = [
  "assert",
  "buffer",
  "constants",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "os",
  "path",
  "querystring",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tty",
  "url",
  "util",
  "vm",
  "zlib",
];

function createTestClientNodePolyfillConfig() {
  const fallback = Object.fromEntries(
    TEST_CLIENT_NODE_POLYFILLS.map((name) => [name, meteorNodeStubs[name] ?? false]),
  );

  return {
    resolve: {
      alias: {
        "timers/promises$": require.resolve("isomorphic-timers-promises"),
      },
      fallback,
    },
    plugins: [
      new ProvidePlugin({
        Buffer: [meteorNodeStubs.buffer, "Buffer"],
      }),
    ],
  };
}

module.exports = { createTestClientNodePolyfillConfig };
