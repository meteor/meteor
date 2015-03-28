Package.describe({
  name: "~package-name~", // replaced via `Sandbox.prototype.createPackage`
  summary: 'This is a test package',
  version: '1.0.1',
  git: 'www.github.com/meteor/meteor'
});

Package.onUse(function(api) {
  api.export("A");
  api.export("B", 'server');
  api.export("C", 'client');
  api.export("D", "web.browser");
  api.export("E", "web.cordova");
  api.export("G", "web.cordova");
  api.export("G", "server");
});
