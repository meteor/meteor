Package.describe({
  summary: "Blaze configuration templates for Google OAuth.",
  version: "1.0.2",
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.0', 'client');

  api.addFiles('google_login_button.css', 'client');
  api.addFiles(
    ['google_configure.html', 'google_configure.js'],
    'client');
});
