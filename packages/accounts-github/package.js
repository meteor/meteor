Package.describe({
  summary: "Login service for Github accounts",
  version: "1.0.6"
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('github', ['client', 'server']);

  api.addFiles('github_login_button.css', 'client');

  api.addFiles("github.js");
});
