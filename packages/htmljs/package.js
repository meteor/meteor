Package.describe({
  summary: "Easy macros for generating DOM elements in Javascript"
});

Package.on_use(function (api) {
  // Note: html.js will optionally use jquery if it's available
  api.add_files('html.js', 'client');
});

Package.on_test(function (api) {
  api.use('htmljs', 'client');
  api.use('tinytest');
  api.add_files('htmljs_test.js', 'client');
});
