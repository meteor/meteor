Package.describe({
  summary: "Login service for Meteor developer accounts",
  internal: true // XXX for now
});

Package.on_use(function (api) {
  api.use(['underscore', 'random']);
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('meteor-developer', ['client', 'server']);

  api.add_files("meteor-developer.js");
  api.add_files("meteor-developer-login-button.css", "client");
});
