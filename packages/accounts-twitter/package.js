Package.describe({
  summary: "Login service for Twitter accounts",
  version: '1.5.2-beta302.4',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('twitter-oauth');
  api.imply('twitter-oauth');

  api.use(['accounts-ui', 'twitter-config-ui'], ['client', 'server'], { weak: true });
  api.addFiles("notice.js");

  api.addFiles("twitter.js");
});
