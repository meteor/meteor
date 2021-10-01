Package.describe({
  summary: "test local package for using stylus"
});

Package.onUse(function (api) {
  api.addFiles('package-file.main.styl');
  api.addFiles(['package-local-export.styl', 'package-export.styl'], 'client',
               {isImport: true});

  api.use('stylus');
});
