Package.describe({
  summary: "Parses Meteor Smart Package version string",
  version: "1.0.6-rc1"
});

Npm.depends({
  'semver': '2.2.1'
});

Package.on_use(function (api) {
  api.export('PackageVersion');
  api.use('underscore');
  api.add_files([ 'package-version-parser.js' ], ['server']);
});

Package.on_test(function (api) {
  api.use('package-version-parser', ['server']);
  api.use(['tinytest']);
  api.add_files('package-version-parser-tests.js', ['server']);
});
