Package.describe({
  summary: "Utility functions for tests",
  version: '1.0.1'
});

Package.on_use(function (api) {
  api.use(['underscore', 'tracker', 'ejson', 'tinytest', 'random']);
  api.use(['jquery'], 'client');

  // XXX for connection.js. Not sure this really belongs in
  // test-helpers. It probably would be better off in livedata. But it's
  // unclear how to put it in livedata so that it can both be used by
  // other package tests and not included in the non-test bundle. One
  // idea would be to make a new separate package 'ddp-test-helpers' or
  // the like.
  api.use('ddp');


  api.export([
    'pollUntil', 'try_all_permutations',
    'SeededRandom', 'clickElement', 'blurElement',
    'focusElement', 'simulateEvent', 'getStyleProperty', 'canonicalizeHtml',
    'renderToDiv',
    'withCallbackLogger', 'testAsyncMulti', 'simplePoll',
    'makeTestConnection', 'DomUtils'], {testOnly: true});

  api.add_files('try_all_permutations.js');
  api.add_files('async_multi.js');
  api.add_files('event_simulation.js');
  api.add_files('seeded_random.js');
  api.add_files('canonicalize_html.js');
  api.add_files('render_div.js');
  api.add_files('current_style.js');
  api.add_files('callback_logger.js');
  api.add_files('domutils.js', 'client');
  api.add_files('connection.js', 'server');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['test-helpers', 'underscore']);
  api.add_files('try_all_permutations_test.js', 'client');
  api.add_files('seeded_random_test.js');
});
