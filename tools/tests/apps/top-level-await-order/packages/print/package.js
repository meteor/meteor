Package.onUse((api) => {
  api.use('meteor');
  api.use('ddp');
  api.addFiles('client.js', 'client');
  api.addFiles('server.js', 'server');
});
