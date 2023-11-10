Package.describe({
  version: '0.1.2',
  summary: 'Show build errors in client when using HMR',
  documentation: 'README.md',
  devOnly: true
});

Package.onUse(function (api) {
  api.use([
    'ecmascript'
  ]);
  api.export('DevErrorOverlay', 'client');
  api.addFiles('client.js', 'modern');
});
