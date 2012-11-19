Package.describe({
  summary: "A user account system"
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.use('localstorage-polyfill', 'client');
  api.use('accounts-urls', 'client');

  // need this because of the Meteor.users collection but in the future
  // we'd probably want to abstract this away
  api.use('mongo-livedata', ['client', 'server']);

  api.add_files('accounts_common.js', ['client', 'server']);
  api.add_files('accounts_server.js', 'server');

  // accounts_client must be before localstorage_token, because
  // localstorage_token attempts to call functions in accounts_client (eg
  // Accounts.callLoginMethod) on startup.
  api.add_files('accounts_client.js', 'client');
  api.add_files('localstorage_token.js', 'client');
});

Package.on_test(function (api) {
  api.use('accounts-base');
  api.use('tinytest');
  api.add_files('accounts_tests.js', 'server');
});
