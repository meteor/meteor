Package.onUse((api) => {
  api.use('ecmascript');
  api.addFiles('b.js');
  api.mainModule('a.js');
});
