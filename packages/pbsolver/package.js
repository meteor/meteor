Package.describe({
  summary: "Pseudo-boolean solver using MiniSat+ (minisat.se)",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.export('PBSolver');
  api.use('check');
  api.use('underscore');
  api.add_files(['minisatp.js', 'api.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('pbsolver');
  api.add_files('pbsolver_tests.js', 'client'); // XXX
});
