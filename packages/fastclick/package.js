Package.describe({
  summary: "Faster touch events on mobile",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.export('FastClick', 'client.cordova');

  api.addFiles(['pre.js', 'fastclick.js', 'post.js'], 'client.cordova');
});
