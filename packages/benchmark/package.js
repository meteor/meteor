Package.describe({
  name: 'benchmark',
  version: '0.0.1',
  // Brief, one-line summary of the package.
  summary: 'Simple benchmarking for blocks of code',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Npm.depends({
  "gc-profiler": "1.2.0",
  "meteor-profiler": "https://github.com/meteor/meteor-profiler/tarball/758c71affdf6b369607a9a2dd7421a11d504662e",
  "getrusage": "0.3.3"
});

Package.onUse(function(api) {
  api.use('ecmascript');
  api.use('ddp-server', {unordered: true});
  api.export('Profile');

  api.addFiles("profile.js", "server");
  api.addFiles("patch_fibers.js", "server");
  api.addFiles("methods.js", "server");
});

Package.onTest(function(api) {
  api.use('ecmascript');
  api.use('tinytest');
  api.use('benchmark');
  api.addFiles('benchmark-tests.js', 'server');
});
