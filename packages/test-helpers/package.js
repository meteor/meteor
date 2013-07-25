Package.describe({
  summary: "Utility functions for tests",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'deps', 'ejson', 'tinytest', 'random',
          'domutils']);
  api.use(['spark', 'jquery'], 'client');

  api.exportSymbol([
    'pollUntil', 'WrappedFrag', 'try_all_permutations', 'StubStream',
    'SeededRandom', 'ReactiveVar', 'OnscreenDiv', 'clickElement', 'blurElement',
    'focusElement', 'simulateEvent', 'getStyleProperty', 'canonicalizeHtml',
    'withCallbackLogger', 'testAsyncMulti'], {testOnly: true});

  api.add_files('try_all_permutations.js');
  api.add_files('async_multi.js');
  api.add_files('event_simulation.js');
  api.add_files('seeded_random.js');
  api.add_files('canonicalize_html.js');
  api.add_files('stub_stream.js');
  api.add_files('onscreendiv.js');
  api.add_files('wrappedfrag.js');
  api.add_files('current_style.js');
  api.add_files('reactivevar.js');
  api.add_files('callback_logger.js');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use(['test-helpers', 'underscore']);
  api.add_files('try_all_permutations_test.js', 'client');
});
