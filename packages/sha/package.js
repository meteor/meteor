Package.describe({
  name: 'sha256',
  version: '1.0.4-plugins.0'
  summary: 'SHA256 implementation',
  git: 'https://github.com/meteor/meteor/tree/devel/packages/sha',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.export('SHA256');
  api.addFiles('sha256.js', ['client', 'server']);
});
