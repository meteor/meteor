Package.describe({
  name: "dynamic-import",
  version: "0.4.0-beta162.14",
  summary: "Runtime support for Meteor 1.5 dynamic import(...) syntax",
  documentation: "README.md"
});

Package.onUse(function (api) {
  // Do not allow this package to be used in pre-Meteor 1.5 apps.
  api.use("isobuild:dynamic-import@1.5.0");

  api.use("modules");
  api.use("promise");
  api.use("http");
  api.use("modern-browsers");

  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
});
