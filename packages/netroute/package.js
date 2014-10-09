// This is a core package instead of in packages/non-core because it
// needs to be uniloaded from tool.
Package.describe({
  summary: "Wrapper for npm netroute module",
  version: "0.2.5-rc.2"
});

Npm.depends({
  netroute: "0.2.5"
});

Package.on_use(function (api) {
  api.export("NpmModuleNetroute", "server");
  api.addFiles("wrapper.js", "server");
});
