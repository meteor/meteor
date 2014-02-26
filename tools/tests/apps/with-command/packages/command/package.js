Package.on_use(function (api) {
  api.add_files('foo.js');
  api.export('main', 'server');
});
