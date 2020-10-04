Package.onUse(function (api) {
  api.use(['coffeescript']);
  api.addFiles(['p.coffee']);
  api.export('FromPackage');
});
