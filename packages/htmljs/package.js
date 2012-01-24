Package.describe({
  summary: "Easy macros for generating DOM elements in Javascript"
});

Package.on_use(function (api) {
  // Note: html.js will optionally use jquery if it's available
  api.add_files('html.js', 'client');
});
