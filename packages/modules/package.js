Package.describe({
  name: "modules",
  version: "0.7.5",
  summary: "CommonJS module system",
  documentation: "README.md",
  git: 'https://github.com/meteor/meteor/tree/master/packages/modules'
});

Npm.depends({
  reify: "0.3.6"
});

Package.onUse(function(api) {
  api.use("underscore");
  api.use("modules-runtime");
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("meteorInstall");
  api.export("Buffer");
  api.export("process");
});
