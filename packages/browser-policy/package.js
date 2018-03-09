Package.describe({
  summary: 'Configure security policies enforced by the browser',
  version: '1.1.1',
});

Package.onUse(api => {
  api.use([
    'ecmascript', 
    'browser-policy-content', 
    'browser-policy-framing',
  ], 'server');
  api.imply(['browser-policy-common'], 'server');
  api.mainModule('browser-policy.js', 'server');
});

Package.onTest(api => {
  api.use([
    'ecmascript',
    'tinytest',
    'browser-policy',
    'ejson',
  ], 'server');
  api.addFiles('browser-policy-test.js', 'server');
});
