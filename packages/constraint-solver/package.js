Package.describe({
  summary: "Given the set of the constraints, picks a satisfying configuration",
  version: "1.0.17"
});

Npm.depends({
  'mori': '0.2.6'
});

Package.onUse(function (api) {
  api.export('ConstraintSolver');
  api.use(['underscore', 'ejson', 'check', 'package-version-parser',
           'binary-heap', 'random', 'logic-solver']);
  api.addFiles(['datatypes.js', 'catalog-cache.js', 'catalog-loader.js',
                'constraint-solver-input.js', 'solver.js',
                'constraint-solver.js']);
  api.addFiles(['resolver.js', 'constraints-list.js',
                'resolver-state.js', 'priority-queue.js'], ['server']);
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

  // data for big benchmarky tests
  api.addFiles('test-data.js', where);

  api.addFiles('datatypes-tests.js', where);
  api.addFiles('catalog-cache-tests.js', where);
  api.addFiles('constraint-solver-tests.js', where);
  api.addFiles('benchmark-tests.js', where);
  api.addFiles('input-tests.js', where);

  // tests of old resolver
  api.addFiles('resolver-tests.js', 'server');
});
