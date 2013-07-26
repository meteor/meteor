Package.describe({
  summary: "Login service for Facebook accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);
  api.use('accounts-oauth', ['client', 'server']);
  api.use('facebook', ['client', 'server']);

  api.add_files('facebook_login_button.css', 'client');

  api.add_files("facebook.js");
});
