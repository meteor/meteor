Package.describe({
  summary: "Login service for Facebook accounts",
  version: "1.1.0"
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('facebook-oauth');
  api.imply('facebook-oauth');

  // If users use accounts-ui but not facebook-config-ui, give them a tip.
  api.use(['accounts-ui', 'facebook-config-ui'], 'client', { weak: true });
  api.addFiles("notice.js");

  api.addFiles("facebook.js");
});
