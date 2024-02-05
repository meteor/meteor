Package.describe({
  summary: "General satisfiability solver for logic problems",
  version: '2.0.9'
});

Npm.depends({
  'lodash.has': '4.5.2'
});

Package.onUse(function (api) {
  api.export('Logic');
  api.addFiles(['minisat.js',
                 'minisat_wrapper.js',
                 'types.js',
                 'logic.js',
                 'optimize.js']);
});

Package.onTest(function (api) {
  api.use(['tinytest', 'check']);
  api.use('logic-solver');

  // logic-solver is totally meant for the client too, but not old
  // ones like IE 8, so we have to exclude it from our automated
  // testing.  It needs a browser released in the last year (say) so
  // that Emscripten-compiled code runs reasonably.
  api.addFiles('logic_tests.js', 'server');
});
