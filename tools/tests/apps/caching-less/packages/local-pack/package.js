Package.onUse(function (api) {
  api.use(['less']);
  api.addFiles('p.less', 'client', {isImport: true});
});
