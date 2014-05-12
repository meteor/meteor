Package.describe({
  summary: "Given the set of the constraints, picks a satisfying configuration",
  version: "1.0.0",
  test: "constraint-solver-test",
  internal: true
});

Npm.depends({
  'semver': '2.2.1',
  'mori': '0.2.6'
});

Package.on_use(function (api) {
  api.export('ConstraintSolver');
  api.use(['underscore', 'ejson', 'check', 'package-version-parser',
           'binary-heap', 'random'], 'server');
  api.add_files(['constraint-solver.js', 'resolver.js', 'constraints-list.js',
                 'dependencies-list.js', 'priority-queue.js'], ['server']);
});

Package.on_test(function (api) {
  api.use('constraint-solver', ['server']);
  api.use(['tinytest', 'minimongo']);
  // data for big benchmarky tests
  api.add_files('test-data.js', ['server']);
  api.add_files('constraint-solver-tests.js', ['server']);
  api.add_files('resolver-tests.js', ['server']);
  api.use('underscore');
});
