/* eslint-env meteor */

Package.describe({
  summary: "Authorization package for Meteor",
  version: "1.0.0",
  name: "roles",
  documentation: null,
});

Package.onUse(function (api) {
  const both = ["client", "server"];

  api.use(
    ["ecmascript", "accounts-base", "tracker", "mongo", "check", "ddp"],
    both
  );

  api.use(["blaze@2.9.0 || 3.0.0"], "client", { weak: true });

  api.export(["Roles", "RolesCollection", "RoleAssignmentCollection"]);

  api.addFiles("roles_client.js", "client");
  api.addFiles("roles_common_async.js", both);
  api.addFiles("roles_server.js", "server");
  api.addFiles(["client/debug.js", "client/uiHelpers.js"], "client");

  api.addAssets("definitions.d.ts", "server");
  api.addAssets("package-types.json", "server");
});

Package.onTest(function (api) {
  const both = ["client", "server"];

  api.use(["tinytest", "ecmascript", "mongo", "roles"], both);

  api.addFiles("tests/serverAsync.js", "server");
  api.addFiles("tests/client.js", "client");
  api.addFiles("tests/clientAsync.js", "client");
});
