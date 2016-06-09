Package.describe({
  summary: "Wrapper around the bcrypt npm package",
  version: '0.8.6',
  documentation: null
});

Npm.depends({
  bcrypt: '0.8.6'
});

Package.onUse(function (api) {
  api.export('NpmModuleBcrypt', 'server');
  api.addFiles('wrapper.js', 'server');
});
