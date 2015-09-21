Package.describe({
  summary: "Given the set of the constraints, picks a satisfying configuration",
  version: "1.0.20"
});

Package.onUse(function (api) {
  api.export('ConstraintSolver');
  api.use([
    'underscore',
    'check',
    'package-version-parser',
    'logic-solver'
  ]);
  api.addFiles([
    'datatypes.js',
    'catalog-cache.js',
    'catalog-loader.js',
    'constraint-solver-input.js',
    'version-pricer.js',
    'solver.js',
    'constraint-solver.js']);
});

Package.onTest(function (api) {
  api.use('constraint-solver');
  api.use([
    'tinytest',
    'minimongo',
    'package-version-parser',
    'underscore',
    'check'
  ]);

  // Only test the package on the server.  Mainly because of
  // package-version-parser, which uses the semver npm module,
  // this package is not "IE 8 clean".  However, it works on
  // modern browsers.
  var where = ['server'];

  // Data for old big, slow tests, which are hidden behind an environment
  // variable
  api.addFiles('gem-test-data.js', where);
  // Data for a case that used to take 20 seconds with the old solver
  api.addFiles('slow-test-data.js', where);
  // Data for a case that used to cause a stack overflow
  api.addFiles('stack-overflow-bug-test-data.js', where);

  api.addFiles('datatypes-tests.js', where);
  api.addFiles('catalog-cache-tests.js', where);
  api.addFiles('constraint-solver-tests.js', where);
  api.addFiles('benchmark-tests.js', where);
  api.addFiles('input-tests.js', where);
  api.addFiles('version-pricer-tests.js', where);
});
