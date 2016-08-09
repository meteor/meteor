Package.describe({
  summary: "Configure security policies enforced by the browser",
  version: "1.0.9",
  git: 'https://github.com/meteor/meteor/tree/master/packages/browser-policy'
});

Package.onUse(function (api) {
  api.use(['browser-policy-content', 'browser-policy-framing'], 'server');
  api.imply(['browser-policy-common'], 'server');
});

Package.onTest(function (api) {
  api.use(["tinytest", "browser-policy", "ejson", "underscore"], "server");
  api.addFiles("browser-policy-test.js", "server");
});
