Package.onUse(function (api) {
  api.use(['coffeescript', 'less']);
  api.addFiles(['p.coffee', 'p.less']);
  api.export('FromPackage');
});
