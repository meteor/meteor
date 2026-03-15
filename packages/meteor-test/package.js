Package.describe({
  name: 'meteor-test',
  summary: 'Modern test driver using the Node.js native test runner (node:test)',
  version: '1.0.0',
});

Package.onUse(function (api) {
  api.use('ecmascript', 'server');
  // Weak dep: if tinytest is loaded by the test package, the bridge kicks in
  api.use('tinytest', 'server', { weak: true });
  api.addFiles('bridge.js', 'server');
  api.addFiles('driver.js', 'server');
});

Npm.depends({
  'happy-dom': '17.4.4',
});

Package.onTest(function (api) {
  api.use(['meteor-test', 'ecmascript', 'check', 'random', 'ejson', 'ddp-client', 'mongo'], 'server');
  api.addFiles('tests-demo.js', 'server');
  api.addFiles('tests-dom.js', 'server');
  api.addFiles('tests-ddp.js', 'server');
});
