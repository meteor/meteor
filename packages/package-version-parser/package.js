Package.describe({
  summary: "Parses Meteor Smart Package version strings",
  version: "3.2.0"
});

Npm.depends({
  semver: "5.4.1"
});

Package.onUse(function (api) {
  api.use('modules');
  api.mainModule('package-version-parser.js');
  api.export('PackageVersion');
});

Package.onTest(function (api) {
  api.use('package-version-parser');
  api.use(['tinytest', 'underscore']);
  api.addFiles('package-version-parser-tests.js', 'server');
});
