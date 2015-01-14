Package.describe({
  summary: "Wrapper around the bcrypt npm package",
  version: '0.7.8-winr.2'
});

Npm.depends({
  bcrypt: '0.7.8'
});

Package.onUse(function (api) {
  api.export('NpmModuleBcrypt', 'server');
  api.addFiles('wrapper.js', 'server');
});
