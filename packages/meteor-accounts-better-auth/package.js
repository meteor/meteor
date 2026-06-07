Package.describe({
  summary: "Better Auth integration for Meteor accounts",
  version: "0.1.0",
});

Package.onUse((api) => {
  api.use("ecmascript");
  api.use("accounts-base", ["client", "server"]);
  api.imply("accounts-base", ["client", "server"]);
  api.use("check", "server");
  api.use("routepolicy", "server");
  api.use("tracker", "client");
  api.use("webapp", "server");

  api.mainModule("server/index.js", "server");
  api.mainModule("client/index.js", "client");
  api.addAssets("meteor-accounts-better-auth.d.ts", "server");
});
