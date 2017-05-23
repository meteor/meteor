Package.describe({
  summary: "Twitter Bootstrap v2.0.2 (glyphicons not supported)"
});

Package.on_use(function (api) {
  api.add_files('twitter-bootstrap.css', 'client');
});
