Package.describe({
  summary: "A user account system"
});

Package.on_use(function (api) {
  api.use('underscore', ['client', 'server']);
  api.use('localstorage', 'client');
  api.use('accounts-urls', ['client', 'server']);
  api.use('deps', 'client');
  api.use('check', 'server');
  api.use('random', ['client', 'server']);
  api.use('service-configuration', ['client', 'server']);

  // need this because of the Meteor.users collection but in the future
  // we'd probably want to abstract this away
  api.use('mongo-livedata', ['client', 'server']);

  // If handlebars happens to be loaded, we'll define some helpers like
  // {{currentUser}}.  If not, no biggie.
  api.use('handlebars', 'client', {weak: true});

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
  api.use('random');
  api.add_files('accounts_tests.js', 'server');
});
