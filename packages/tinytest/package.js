Package.describe({
  summary: "Tiny testing framework",
  internal: true
});

Package.on_use(function (api) {
  // XXX figure out how to do server-side testing
  api.use('underscore', 'client');
  api.add_files('tinytest.js', 'client');
});
