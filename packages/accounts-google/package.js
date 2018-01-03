Package.describe({
  summary: "Login service for Google accounts",
  version: "1.3.1"
});

Package.onUse(function(api) {
  api.use(['ecmascript', 'underscore', 'random']);
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('google-oauth');
  api.imply('google-oauth');

  // If users use accounts-ui but not google-config-ui, give them a tip.
  api.use(['accounts-ui', 'google-config-ui'], ['client', 'server'], { weak: true });
  api.addFiles("notice.js");

  api.addFiles("google.js");
});
