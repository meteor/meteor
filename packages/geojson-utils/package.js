Package.describe({
  summary: "Meteor's client-side datastore: a port of MongoDB to Javascript",
  internal: true
});

Package.on_use(function (api) {
  api.export('GeoJSON');
  api.add_files(['geojson-utils.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.add_files(['geojson-utils.js', 'geojson-utils.tests.js'], 'client');
});

