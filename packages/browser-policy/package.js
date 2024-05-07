Package.describe({
  summary: "Configure security policies enforced by the browser",
  version: '1.1.3-rc300.1',
});

Package.onUse(function (api) {
  api.use('modules');
  api.use(['browser-policy-content', 'browser-policy-framing'], 'server');
  api.imply(['browser-policy-common'], 'server');
  api.mainModule('browser-policy.js', 'server');
});

Package.onTest(function (api) {
  api.use(["tinytest", "browser-policy", "ejson"], "server");
  api.addFiles("browser-policy-tests.js", "server");
});
