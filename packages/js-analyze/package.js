Package.describe({
  summary: "JavaScript code analysis for Meteor"
});

// Use some packages from the Esprima project.  If it turns out we need these on
// the client too, can copy them in (or implement a way to serve files out of
// Npm modules).
Npm.depends({
  // This code was originally written against the unreleased 1.1 branch. We can
  // probably switch to a built NPM version when it gets released.
  esprima: "https://github.com/ariya/esprima/tarball/5044b87f94fb802d9609f1426c838874ec2007b3",
  estraverse: "1.1.2-1",
  escope: "0.0.14"
});

Package.on_use(function (api, where) {
  api.add_files('js_analyze.js', 'server');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('js-analyze');
  api.add_files('esprima_tests.js', 'server');
  api.add_files('js_analyze_tests.js', 'server');
});
