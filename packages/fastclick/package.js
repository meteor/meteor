Package.describe({
  summary: "Faster touch events on mobile",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.addFiles('init-fastclick.js', 'client');
});

Npm.depends({
  'fastclick': '1.0.3'
});