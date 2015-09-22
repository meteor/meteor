Package.describe({
  summary: "Login service for Meteor developer accounts",
  version: "1.0.6"
});

Package.onUse(function (api) {
  api.use(['underscore', 'random']);
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('meteor-developer', ['client', 'server']);

  api.addFiles("meteor-developer.js");
  api.addFiles("meteor-developer-login-button.css", "client");
});
