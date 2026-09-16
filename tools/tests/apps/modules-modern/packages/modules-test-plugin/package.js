Package.describe({
  name: "modules-test-plugin",
  version: "0.0.1",
  summary: "",
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: null
});

Package.registerBuildPlugin({
  name: "compile-arson",
  use: ["ecmascript"],
  sources: ["plugin.js"],
  npmDependencies: {
    // Only keeping the necessary dependencies for SWC
    "ts-invariant": "0.4.1"
  }
});

Npm.depends({
  arson: "0.2.3",
  "vue-template-compiler": "2.5.16"
});

Package.onUse(function(api) {
  api.use("ecmascript");
  api.use("isobuild:compiler-plugin@1.0.0")
  api.mainModule("modules-test-plugin.js");
});
