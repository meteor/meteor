Package.describe({version: '1.0.0'});

Npm.depends({});

Package.on_use(function (api) { api.add_files('dummy.js', 'server'); });
