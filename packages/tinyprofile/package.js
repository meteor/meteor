Package.describe({
  summary: "Tiny profiler",
  internal: true
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.export('Profile');
  api.add_files('profile.js', 'server');
});
