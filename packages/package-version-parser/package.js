Package.describe({
  summary: "Parses Meteor Smart Package version strings",
  version: "3.0.9",
  git: 'https://github.com/meteor/meteor/tree/master/packages/package-version-parser'
});

Package.onUse(function (api) {
  api.export('PackageVersion');
  api.use('underscore');
  api.addFiles(['semver410.js',
                'package-version-parser.js']);
});

Package.onTest(function (api) {
  api.use('package-version-parser');
  api.use(['tinytest', 'underscore']);
  api.addFiles('package-version-parser-tests.js', 'server');
});
