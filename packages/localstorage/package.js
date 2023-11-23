Package.describe({
  summary: "Simulates local storage on IE 6,7 using userData",
  version: "1.2.1-alpha300.19",
});

Package.onUse(function (api) {
  api.use('random');
  api.addFiles('localstorage.js');
});

Package.onTest(function (api) {
  api.use('localstorage');
  api.use('tinytest');
  api.addFiles('localstorage_tests.js');
});
