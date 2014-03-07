Package.describe({
  summary: "Given the set of the constraints, picks a satisfying configuration",
  version: "1.0.0",
  internal: true
});

Npm.depends({
  'semver': '2.2.1'
});

Package.on_use(function (api) {
  api.export('ConstraintSolver');
  api.use(['underscore', 'ejson', 'check', 'package-version-parser']);
  api.add_files([ 'constraint-solver.js' ], ['server', 'client']);
});

Package.on_test(function (api) {
  api.use('constraint-solver', ['client', 'server']);
  api.use(['tinytest', 'minimongo']);
  api.add_files('constraint-solver-tests.js', ['server', 'client']);
});
