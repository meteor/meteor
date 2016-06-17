Package.describe({
  summary: "Wrapper around the node-aes-gcm npm package",
  version: '0.1.5_1',
  documentation: null
});

Npm.depends({
  'node-aes-gcm': '0.1.5'
});

Package.onUse(function (api) {
  api.export('NpmModuleNodeAesGcm', 'server');
  api.addFiles('wrapper.js', 'server');
});
