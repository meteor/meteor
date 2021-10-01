Package.describe({
  name: 'with-add-files',
  version: '0.0.1'
});

Package.onUse(function(api) {
  api.versionsFrom('1.3.2.4');
  api.use('ecmascript');
  api.addFiles('with-add-files.js');
  api.export('name');
});
