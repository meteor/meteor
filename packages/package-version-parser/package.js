Package.describe({
  summary: "Parses Meteor Smart Package version strings",
  version: "3.2.2-alpha300.19"
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
  api.use(['package-version-parser', 'tinytest']);
  api.addFiles('package-version-parser-tests.js', 'server');
});
