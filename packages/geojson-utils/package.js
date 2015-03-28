Package.describe({
  summary: 'GeoJSON utility functions (from https://github.com/maxogden/geojson-js-utils)',
  version: '1.0.3'
});

Package.onUse(function (api) {
  api.export('GeoJSON');
  api.addFiles(['pre.js', 'geojson-utils.js', 'post.js']);
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('geojson-utils');
  api.addFiles(['geojson-utils.tests.js'], 'client');
});
