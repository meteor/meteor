Package.describe({
  summary: "Login service for Meetup accounts",
  version: "1.0.4"
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('meetup', ['client', 'server']);

  api.addFiles('meetup_login_button.css', 'client');

  api.addFiles("meetup.js");
});
