Package.describe({
  name: "user:colon-name",
  version: "0.0.1",
  summary: "Package with a colon in its name",
  git: "https://github.com/meteor/meteor/tree/devel/" +
    "tools/tests/apps/dynamic-import/packages",
  documentation: "README.md"
});

Package.onUse(function(api) {
  api.use("ecmascript");
});
