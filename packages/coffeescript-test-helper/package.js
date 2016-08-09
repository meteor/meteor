Package.describe({
  summary: "Used by the coffeescript package's tests",
  version: "1.0.7",
  git: 'https://github.com/meteor/meteor/tree/master/packages/coffeescript-test-helper'
});

Package.onUse(function (api) {
  api.use('coffeescript', ['client', 'server']);
  api.export('COFFEESCRIPT_EXPORTED');
  api.addFiles("exporting.coffee", ['client', 'server']);
});
