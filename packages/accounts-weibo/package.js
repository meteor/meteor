Package.describe({
  summary: "Login service for Sina Weibo accounts",
  version: "1.0.4-winr.2",
  documentation: null // XXX REMOVE
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('weibo', ['client', 'server']);

  api.addFiles('weibo_login_button.css', 'client');

  api.addFiles("weibo.js");
});
