Package.describe({
  name: 'prod-only',
  prodOnly: true
});

Package.onUse(function(api) {
  api.addFiles('prod-only.js');
});
