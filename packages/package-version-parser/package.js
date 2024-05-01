Package.describe({
  summary: "Parses Meteor Smart Package version strings",
  version: '3.2.2-rc300.0',
});

Npm.depends({
  semver: "7.5.4"
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
