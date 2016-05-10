Package.describe({
  summary: "Wrapper around the node-aes-gcm npm package",
  version: '0.1.7_2',
  documentation: null
});

Npm.depends({
  'meteor-node-aes-gcm': '0.1.7'
});

Package.onUse(function (api) {
  api.use("modules@0.6.1");
  api.export('NpmModuleNodeAesGcm', 'server');
  api.addFiles('wrapper.js', 'server');
});
