Package.describe({
  name: 'prod-only',
  prodOnly: true
});

Package.onUse(function (api) {
  api.mainModule('prod-only.js');
  api.export('ProdOnly');
});
