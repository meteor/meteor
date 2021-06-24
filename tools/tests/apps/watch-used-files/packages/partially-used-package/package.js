Package.describe({
  name: 'partially-used',
  documentation: null
});

Package.onUse((api) => {
  api.use('ecmascript');
  api.mainModule('./client.js', 'client');
  api.mainModule('./server.js', 'server');
});
