Package.describe({
  summary: "Simulates the localStorage API on IE 6,7 using userData",
});

Package.on_use(function (api) {
  api.use('jquery', 'client'); // XXX only used for browser detection. remove.

  api.add_files('localstorage_polyfill.js', 'client');
});

Package.on_test(function (api) {
  api.use('localstorage-polyfill', 'client');
  api.use('tinytest');

  api.add_files('localstorage_polyfill_tests.js', 'client');
});
