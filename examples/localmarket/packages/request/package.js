Package.describe({
  summary: "Wraps the request module from Npm in a fiber.",
  version: '0.0.0'
});

Npm.depends({request: "2.33.0"});

Package.on_use(function (api) {
  api.add_files('request-server.js', 'server');
  api.export('Request');
});
