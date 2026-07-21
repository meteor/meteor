const { ProvidePlugin } = require("@rspack/core");

let meteorNodeStubs;
try {
  meteorNodeStubs = require("meteor-node-stubs");
} catch (e) {
  // It's optional. If not installed, meteorNodeStubs remains undefined.
}

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
    TEST_CLIENT_NODE_POLYFILLS.map((name) => [name, meteorNodeStubs?.[name] ?? false]),
  );

  const plugins = [];
  
  if (meteorNodeStubs?.buffer) {
    plugins.push(
      new ProvidePlugin({
        Buffer: [meteorNodeStubs.buffer, "Buffer"],
      })
    );
  }

  return {
    resolve: {
      alias: {
        "timers/promises$": require.resolve("isomorphic-timers-promises"),
      },
      fallback,
    },
    plugins,
  };
}

module.exports = { createTestClientNodePolyfillConfig };
