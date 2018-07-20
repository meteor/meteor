Package.describe({
  summary: "Password support for accounts",
  // Note: 2.2.0-beta.3 was published during the Meteor 1.6 prerelease
  // process, so it might be best to skip to 2.3.x instead of reusing
  // 2.2.x in the future. The version was also bumped to 2.0.0 temporarily
  // during the Meteor 1.5.1 release process, so versions 2.0.0-beta.2
  // through -beta.5 and -rc.0 have already been published.
  version: "1.5.1"
});

Package.onUse(api => {
  api.use('npm-bcrypt', 'server');

  api.use([
    'accounts-base',
    'srp',
    'sha',
    'ejson',
    'ddp'
  ], ['client', 'server']);

  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('email', 'server');
  api.use('random', 'server');
  api.use('check', 'server');
  api.use('ecmascript');

  api.addFiles('email_templates.js', 'server');
  api.addFiles('password_server.js', 'server');
  api.addFiles('password_client.js', 'client');
});

Package.onTest(api => {
  api.use(['accounts-password', 'tinytest', 'test-helpers', 'tracker',
           'accounts-base', 'random', 'email', 'check', 'ddp', 'ecmascript']);
  api.addFiles('password_tests_setup.js', 'server');
  api.addFiles('password_tests.js', ['client', 'server']);
  api.addFiles('email_tests_setup.js', 'server');
  api.addFiles('email_tests.js', 'client');
});
