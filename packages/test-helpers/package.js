Package.describe({
  summary: "Utility functions for tests",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ["client", "server"];

  api.use(['underscore', 'deps', 'ejson', 'tinytest', 'random',
          'domutils']);
  api.use(['spark'], 'client');

  api.add_files('try_all_permutations.js', where);
  api.add_files('async_multi.js', where);
  api.add_files('event_simulation.js', where);
  api.add_files('seeded_random.js', where);
  api.add_files('canonicalize_html.js', where);
  api.add_files('stub_stream.js', where);
  api.add_files('onscreendiv.js', where);
  api.add_files('wrappedfrag.js', where);
  api.add_files('current_style.js', where);
  api.add_files('reactivevar.js', where);
  api.add_files('callback_logger.js', where);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['test-helpers', 'underscore']);
  api.add_files('try_all_permutations_test.js', 'client');
});
