Package.describe({
  name: 'meteortesting:mocha-fix',
  summary: 'Workaround for meteortesting:mocha@3.4.0-rc.0 startup deadlock (PR #177)',
  version: '0.0.1',
  testOnly: true,
});

Package.onUse(function (api) {
  api.versionsFrom('METEOR@3.0');
  api.use(['ecmascript', 'meteor', 'meteortesting:mocha']);
  api.addFiles('mocha-fix.js', 'server');
});
