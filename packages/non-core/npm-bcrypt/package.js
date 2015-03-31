Package.describe({
  summary: "Wrapper around the bcrypt npm package",
  version: '0.7.8_2',
  documentation: null
});

Npm.depends({
  bcrypt: '0.7.8'
});

Package.onUse(function (api) {
  api.export('NpmModuleBcrypt', 'server');
  api.addFiles('wrapper.js', 'server');
});
