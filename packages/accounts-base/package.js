Package.describe({
  summary: "A user account system",
  version: "1.1.1"
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('localstorage', 'client');
  api.use('tracker', 'client');
  api.use('check', 'server');
  api.use('random', ['client', 'server']);
  api.use('ejson', 'server');
  api.use('callback-hook', 'server');

  // use unordered to work around a circular dependency
  // (service-configuration needs Accounts.connection)
  api.use('service-configuration', ['client', 'server'], { unordered: true });

  // needed for getting the currently logged-in user
  api.use('ddp', ['client', 'server']);

  // need this because of the Meteor.users collection but in the future
  // we'd probably want to abstract this away
  api.use('mongo', ['client', 'server']);

  // If the 'blaze' package is loaded, we'll define some helpers like
  // {{currentUser}}.  If not, no biggie.
  api.use('blaze', 'client', {weak: true});

  // Allow us to detect 'autopublish', and publish some Meteor.users fields if
  // it's loaded.
  api.use('autopublish', 'server', {weak: true});

  api.use('oauth-encryption', 'server', {weak: true});

  api.export('Accounts');

  api.add_files('accounts_common.js', ['client', 'server']);
  api.add_files('accounts_server.js', 'server');
  api.add_files('url_client.js', 'client');
  api.add_files('url_server.js', 'server');

  // accounts_client must be before localstorage_token, because
  // localstorage_token attempts to call functions in accounts_client (eg
  // Accounts.callLoginMethod) on startup. And localstorage_token must be after
  // url_client, which sets autoLoginEnabled.
  api.add_files('accounts_client.js', 'client');
  api.add_files('localstorage_token.js', 'client');
});

Package.on_test(function (api) {
  api.use('accounts-base');
  api.use('tinytest');
  api.use('random');
  api.use('test-helpers');
  api.use('oauth-encryption');
  api.add_files('accounts_tests.js', 'server');
});
