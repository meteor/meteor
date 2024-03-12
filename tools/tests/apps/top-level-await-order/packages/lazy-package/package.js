Package.onUse((api) => {
  api.use('ecmascript');
  api.mainModule('main.js', ['client', 'server'], { lazy: true});
});
