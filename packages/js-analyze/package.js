// IF YOU MAKE ANY CHANGES TO THIS PACKAGE THAT COULD AFFECT ITS OUTPUT, YOU
// MUST UPDATE BUILT_BY IN tools/packages.js. Otherwise packages may not be
// rebuilt with the new changes.

Package.describe({
  summary: "JavaScript code analysis for Meteor",
  version: '1.0.5'
});

// Use some packages from the Esprima project.  If it turns out we need these on
// the client too, can copy them in (or implement a way to serve files out of
// Npm modules).
Npm.depends({
  esprima: "1.2.2",
  escope: "1.0.1"
});

Npm.strip({
  esprima: ["test/"]
});

// This package may not depend on ANY other Meteor packages, even in the test
// slice. (Tests for this package are in the js-analyze-tests package.) This is
// because it is used by the linker; the linker is smart enough not to try to
// apply it to itself, but it cannot depend on any other packages or else it
// would be impossible to load at link time (or all transitive dependencies
// packages would need to function without the analysis provided by this
// package).
Package.onUse(function (api) {
  api.export('JSAnalyze', 'server');
  api.addFiles('js_analyze.js', 'server');
});
