Package.describe({
  summary: "Login service for Google accounts",
  version: '1.4.1-rc300.1',
});

Package.onUse(api => {
  api.use(['ecmascript']);
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
