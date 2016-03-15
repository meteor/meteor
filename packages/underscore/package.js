Package.describe({
  summary: "Collection of small helpers: _.map, _.each, ...",
  version: '1.0.6-rc.1'
});

Package.onUse(function (api) {
  api.use('underscore-base');
  api.addFiles('underscore.js');
  api.export('_');
});

Package.onTest(function (api) {
  api.use(['tinytest', 'underscore']);
  api.addFiles('each_test.js');
});
