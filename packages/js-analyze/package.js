// IF YOU MAKE ANY CHANGES TO THIS PACKAGE THAT COULD AFFECT ITS OUTPUT, YOU
// MUST UPDATE BUILT_BY IN tools/packages.js. Otherwise packages may not be
// rebuilt with the new changes.

Package.describe({
  summary: "JavaScript code analysis for Meteor",
  internal: true
});

// Use some packages from the Esprima project.  If it turns out we need these on
// the client too, can copy them in (or implement a way to serve files out of
// Npm modules).
Npm.depends({
  // This code was originally written against the unreleased 1.1 branch. We can
  // probably switch to a built NPM version when it gets released.
  esprima: "https://github.com/ariya/esprima/tarball/2a41dbf0ddadade0b09a9a7cc9a0c8df9c434018",
  escope: "1.0.0"
});

// This package may not depend on ANY other Meteor packages, even in the test
// slice. (Tests for this package are in the js-analyze-tests package.) This is
// because it is used by the linker; the linker is smart enough not to try to
// apply it to itself, but it cannot depend on any other packages or else it
// would be impossible to load at link time (or all transitive dependencies
// packages would need to function without the analysis provided by this
// package).
Package.on_use(function (api) {
  api.export('JSAnalyze', 'server');
  api.add_files('js_analyze.js', 'server');
});
