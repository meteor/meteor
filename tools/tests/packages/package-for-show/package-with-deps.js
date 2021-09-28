Package.describe({
  name: "~package-name~", // replaced via `Sandbox.prototype.createPackage`
  summary: 'This is a test package with dependencies',
  version: '1.2.0',
  git: 'www.github.com/meteor/meteor',
  documentation: null
});

Package.onUse(function(api) {
  // Test that dependencies show up.
  api.use("~baseDependency~@1.0.0");
  // Test that constraints and weak dependencies show up correctly.
  api.use("~weakDependency~@=1.0.0", { weak: true });
});
