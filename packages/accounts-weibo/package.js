Package.describe({
  summary: "Login service for Sina Weibo accounts",
  version: "1.3.2",
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('weibo-oauth');
  api.imply('weibo-oauth');

  api.use(['accounts-ui', 'weibo-config-ui'], ['client', 'server'], { weak: true });
  api.addFiles("notice.js");

  api.addFiles("weibo.js");
});
