Package.describe({
  summary: "Login service for Twitter accounts",
  version: "1.0.4"
});

Package.onUse(function(api) {
  api.use('underscore', ['server']);
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('twitter', ['client', 'server']);

  api.use('http', ['client', 'server']);

  api.addFiles('twitter_login_button.css', 'client');

  api.addFiles("twitter.js");
});
