
Package.describe({
  summary: "Standards-compliant HTML5 parser"
});

Npm.depends({
  // forked in anticipation of PRs
  html5: "https://github.com/meteor/html5/tarball/88261534f4f9143eeb083ce47c6389731c905bfe"
});

Package.on_use(function (api) {
  api.export('HTML5', 'server');
  api.add_files('html5.js', 'server');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('html5');
  api.add_files('html5_tests.js', 'server');
});
