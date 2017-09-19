Package.describe({
  name: "dynamic-import",
  version: "0.1.3",
  summary: "Runtime support for Meteor 1.5 dynamic import(...) syntax",
  documentation: "README.md"
});

Package.onUse(function (api) {
  // Do not allow this package to be used in pre-Meteor 1.5 apps.
  api.use("isobuild:dynamic-import@1.5.0");

  // Modify browser policy only if browser-policy packages are used.
  api.use("browser-policy-content", { weak: true });

  api.use("modules");
  api.use("promise");
  api.use("ddp");
  api.use("check");
  api.use("ecmascript", "server");

  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
});
