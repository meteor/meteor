Package.describe({
  name: 'asset-and-source',
  version: '0.0.1'
});

Package.onUse(function(api) {
  api.addFiles('asset-and-source.js');
  api.addAssets('asset-and-source.js', ['client', 'server']);
});
