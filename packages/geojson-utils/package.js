Package.describe({
  summary: 'GeoJSON utility functions (from https://github.com/maxogden/geojson-js-utils)',
  internal: true
});

Package.on_use(function (api) {
  api.export('GeoJSON');
  api.add_files(['pre.js', 'geojson-utils.js', 'post.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('geojson-utils');
  api.add_files(['geojson-utils.tests.js'], 'client');
});

