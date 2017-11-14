Package.describe({
  name: "sockjs-shim",
  version: "0.1.0",
  summary: "Selectively server-side renders a SockJS polyfill <script> " +
    "for older browsers",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("server-render");
  api.use("shim-common");
  api.mainModule("server.js", "server");
  api.addAssets([
    "sockjs-0.3.4.js",
    "sockjs-0.3.4.min.js",
  ], "client");
});

Package.onTest(function(api) {
  api.use("ecmascript");
  api.use("tinytest");
  api.use("sockjs-shim");
  api.mainModule("client-tests.js", "client");
});
