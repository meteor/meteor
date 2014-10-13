Package.describe({
  summary: "Parses Meteor Smart Package version string",
  version: "2.0.2"
});

Npm.depends({
  'semver': '3.0.1'
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
