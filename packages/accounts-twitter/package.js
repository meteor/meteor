Package.describe({
  summary: "Login service for Twitter accounts",
  version: "1.5.1-beta300.3",
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('twitter-oauth');
  api.imply('twitter-oauth');

  api.use('http@1.0.1', ['client', 'server']);

  api.use(['accounts-ui', 'twitter-config-ui'], ['client', 'server'], { weak: true });
  api.addFiles("notice.js");

  api.addFiles("twitter.js");
});
