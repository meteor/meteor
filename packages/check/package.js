Package.describe({
  summary: 'Check whether a value matches a pattern',
  version: '1.5.0',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('harry97:cbor@1.2.1');

  api.addAssets('check.d.ts', 'server');

  api.mainModule('match.js');

  api.export('check');
  api.export('Match');
});

Package.onTest(api => {
  api.use(['check', 'tinytest', 'harry97:cbor@1.2.1', 'ecmascript'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
