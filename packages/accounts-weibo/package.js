Package.describe({
  summary: "Login service for Sina Weibo accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('weibo', ['client', 'server']);

  api.add_files('weibo_login_button.css', 'client');

  api.add_files("weibo.js");
});
