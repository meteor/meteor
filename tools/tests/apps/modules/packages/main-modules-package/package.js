Package.describe({
  name: "main-modules-package",
  version: "0.0.1",
});

Package.onUse(api => {
  api.use("ecmascript");
  api.mainModules("src/**/*.js");
});
