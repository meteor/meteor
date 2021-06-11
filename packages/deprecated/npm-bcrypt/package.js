Package.describe({
  summary: "Wrapper around the bcrypt npm package",
  version: "0.9.4",
  documentation: null,
  deprecated: true
});

Npm.depends({
  bcryptjs: "2.3.0"
});

Package.onUse(function (api) {
  api.use("modules", "server");
  api.mainModule("wrapper.js", "server");
  api.export("NpmModuleBcrypt", "server");
});
