Package.describe({
  summary: "Three.js - lightweight 3D library with a very low level of complexity"
});

Package.on_use(function (api) {
  api.add_files('Three.js', 'client');
});
