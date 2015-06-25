Package.describe({
  summary: "test local package for using stylus"
});

Package.onUse(function (api) {
  api.addFiles('package-file.main.styl', 'client');
  api.addFiles('package-local-export.styl', 'client');
  api.addFiles('package-export.styl', 'client');

  api.use('stylus');
});
