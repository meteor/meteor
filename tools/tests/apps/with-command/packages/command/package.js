Package.describe({
  name: "command",
  version: "1.0.0",
  summary: "test command"
});

Package.on_use(function (api) {
  api.add_files('foo.js');
  api.export('main', 'server');
});
