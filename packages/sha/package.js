Package.describe({
  version: '1.0.8',
  summary: 'SHA256 implementation',
  git: 'https://github.com/meteor/meteor/tree/master/packages/sha'
});

Package.onUse(function (api) {
  api.export('SHA256');
  api.addFiles('sha256.js');
});
