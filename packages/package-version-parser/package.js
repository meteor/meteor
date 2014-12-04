Package.describe({
  summary: "Parses Meteor Smart Package version string",
  version: "2.0.3-ipc.0"
});

Npm.depends({
  'semver': '4.1.0'
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
