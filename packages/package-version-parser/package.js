Package.describe({
  summary: "Parses Meteor Smart Package version string",
  version: "1.0.0",
  test: "package-version-parser-test",
  internal: true
});

Npm.depends({
  'semver': '2.2.1'
});

Package.on_use(function (api) {
  api.export('PackageVersion');
  api.add_files([ 'package-version-parser.js' ], ['client', 'server']);
});

Package.on_test(function (api) {
  api.use('package-version-parser', ['client', 'server']);
  api.use(['tinytest']);
  api.add_files('package-version-parser-tests.js', ['client', 'server']);
});
