Package.describe({
  summary: "General satisfiability solver for logic problems",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.export('Logic');
  api.use('check');
  api.use('underscore');
  api.add_files(['minisat.js',
                 'minisat_wrapper.js',
                 'logic.js',
                 'optimize.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('logic-solver');

  // logic-solver is totally meant for the client too, but not old
  // ones like IE 8, so we have to exclude it from our automated
  // testing.  It needs a browser released in the last year (say) so
  // that Emscripten-compiled code runs reasonably.
  api.add_files('logic_tests.js', 'server');
});
