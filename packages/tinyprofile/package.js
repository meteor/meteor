Package.describe({
  summary: "Tiny profiler",
  internal: true,
  version: "0.0.1-winr.0",
  documentation: null
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.export('Profile');
  api.add_files('profile.js', 'server');
});
