Package.describe({
  summary: 'Check whether a value matches a pattern',
  version: '1.4.1',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use(['ejson', 'binary'])

  api.addAssets('check.d.ts', 'server');

  api.mainModule('match.js');

  api.export('check');
  api.export('Match');
});

Package.onTest(api => {
  api.use(['check', 'tinytest', 'ejson', 'ecmascript', 'binary'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
