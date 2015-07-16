Package.onUse(function (api) {
  api.use(['coffeescript', 'less']);
  api.addFiles(['p.coffee']);
  api.addFiles('p.less', 'client', {isImport: true});
  api.export('FromPackage');
});
