Package.describe({
  name: "npm-bcrypt",
  summary: "Wrapper around the bcrypt npm package",
  version: '0.7.7',
  internal: true
});

Npm.depends({
  bcrypt: '0.7.7'
});

Package.on_use(function (api) {
  api.export('NpmModuleBcrypt', 'server');
  api.addFiles('wrapper.js', 'server');
});
