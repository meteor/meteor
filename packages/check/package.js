Package.describe({
  summary: 'Check whether a value matches a pattern',
  version: '1.3.3-alpha300.20',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('ejson');

  api.addAssets('check.d.ts', 'server');

  api.mainModule('match.js');

  api.export('check');
  api.export('Match');
});

Package.onTest(api => {
  api.use(['check', 'tinytest', 'ejson', 'ecmascript'], ['client', 'server']);

  api.addFiles('match_test.js', ['client', 'server']);
});
