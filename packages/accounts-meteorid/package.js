Package.describe({
  summary: "Login service for Meteor accounts",
  internal: true // XXX for now
});

Package.on_use(function (api) {
  api.use(['underscore', 'random']);
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('meteorid', ['client', 'server']);

  api.add_files("accounts-meteorid.js");
});
