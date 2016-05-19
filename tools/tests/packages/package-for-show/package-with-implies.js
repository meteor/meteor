Package.describe({
  name: "~package-name~", // replaced via `Sandbox.prototype.createPackage`
  summary: 'This is a test package',
  version: '1.2.1',
  git: 'www.github.com/meteor/meteor'
});

Package.onUse(function(api) {
  api.imply("~A~@1.0.0");
  api.imply("~B~@1.0.0", 'server');
  api.imply("~C~@1.0.0", 'client');
  api.imply("~D~@1.0.0", 'web.browser');
  api.imply("~E~@1.0.0", 'web.cordova');
  api.imply("~G~@1.0.0", 'web.cordova');
  api.imply("~G~@1.0.0", 'server');
});
