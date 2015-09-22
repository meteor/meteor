Package.onUse(function (api) {
  api.use(['stylus']);
  api.addFiles('p.styl', 'client', {isImport: true});
});
