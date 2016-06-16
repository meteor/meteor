Package.describe({
  summary: "Wrapper around the node-aes-gcm npm package",
  version: '0.1.7_5',
  documentation: null
});

Npm.depends({
  'node-aes-gcm': '0.1.7'
});

Package.onUse(function (api) {
  api.export('NpmModuleNodeAesGcm', 'server');
  api.addFiles('wrapper.js', 'server');
});
