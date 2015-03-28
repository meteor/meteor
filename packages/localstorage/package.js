Package.describe({
  summary: "Simulates local storage on IE 6,7 using userData",
  version: "1.0.3"
});

Package.onUse(function (api) {
  api.use('random', 'client');

  api.addFiles('localstorage.js', 'client');
});

Package.onTest(function (api) {
  api.use('localstorage', 'client');
  api.use('tinytest');

  api.addFiles('localstorage_tests.js', 'client');
});
