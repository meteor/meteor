Package.describe({
  summary: 'GeoJSON utility functions (from https://github.com/maxogden/geojson-js-utils)',
  version: '1.0.10'
});

Package.onUse(function (api) {
  api.use('modules');
  api.export('GeoJSON');
  api.mainModule('main.js');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('underscore');
  api.use('geojson-utils');
  api.addFiles(['geojson-utils.tests.js'], 'client');
});
