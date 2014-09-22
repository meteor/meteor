Package.describe({
  summary: "Simulates local storage on IE 6,7 using userData",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.use('random', 'client');

  api.add_files('localstorage.js', 'client');
});

Package.on_test(function (api) {
  api.use('localstorage', 'client');
  api.use('tinytest');

  api.add_files('localstorage_tests.js', 'client');
});
