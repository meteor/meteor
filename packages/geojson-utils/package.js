Package.describe({
  summary: 'GeoJSON utility functions (from https://github.com/maxogden/geojson-js-utils)',
  version: '1.0.12',
});

Package.onUse(function (api) {
  api.use('modules');
  api.export('GeoJSON');
  api.mainModule('main.js');
  api.types('geojson-utils.d.ts');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('geojson-utils');
  api.addFiles(['geojson-utils.tests.js'], 'client');
});
