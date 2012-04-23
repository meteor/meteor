Package.describe({
  summary: "Determine if a client can view high res images"
});

Package.on_use(function (api) {
  api.add_files('foresight.js', 'client');
});
