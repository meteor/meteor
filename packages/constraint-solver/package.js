Package.describe({
  summary: "Given the set of the constraints, picks a satisfying configuration",
  version: "1.0.18-vs.3"
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
  api.use(['tinytest', 'minimongo', 'package-version-parser']);
  api.use('underscore');

  // Only test the package on the server.  Mainly because of
  // package-version-parser, which uses the semver npm module,
  // this package is not "IE 8 clean".  However, it works on
  // modern browsers.
  var where = ['server'];

  api.addFiles('gem-data.js', where); // data for old big, slow tests
  api.addFiles('stack-overflow-bug-data.js', where);

  api.addFiles('datatypes-tests.js', where);
  api.addFiles('catalog-cache-tests.js', where);
  api.addFiles('constraint-solver-tests.js', where);
  api.addFiles('benchmark-tests.js', where);
  api.addFiles('input-tests.js', where);
  api.addFiles('version-pricer-tests.js', where);
});
