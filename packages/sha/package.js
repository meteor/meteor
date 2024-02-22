Package.describe({
  version: '1.0.10-beta300.3',
  summary: 'SHA256 implementation',
  git: 'https://github.com/meteor/meteor'
});

Package.onUse(function (api) {
  api.export('SHA256');
  api.addFiles('sha256.js');
});
