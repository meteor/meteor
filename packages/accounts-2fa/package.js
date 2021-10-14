Package.describe({
  summary: '2-factor user authentication',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript', ['client', 'server']);
  api.use('ddp-rate-limiter');
  api.use('localstorage', 'client');
  api.use('check', 'server');
  api.use('random', ['client', 'server']);
  api.use('ejson', 'server');
  api.use('callback-hook', ['client', 'server']);
  api.use('reactive-var', 'client');

  // needed for getting the currently logged-in user and handling reconnects
  api.use('ddp', ['client', 'server']);

  // need this because of the Meteor.users collection but in the future
  // we'd probably want to abstract this away
  api.use('mongo', ['client', 'server']);

  api.use('oauth-encryption', 'server', { weak: true });

  api.mainModule('server_main.js', 'server');
  api.mainModule('client_main.js', 'client');
});

Package.onTest(api => {
  api.use([
    'accounts-base',
    'ecmascript',
    'tinytest',
    'random',
    'test-helpers',
    'oauth-encryption',
    'ddp',
    'accounts-password',
  ]);

  api.addFiles('accounts_tests_setup.js', 'server');
  api.mainModule('server_tests.js', 'server');
  api.mainModule('client_tests.js', 'client');
});
