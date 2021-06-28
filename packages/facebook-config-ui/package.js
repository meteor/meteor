Package.describe({
  summary: "Blaze configuration templates for Facebook OAuth.",
  version: "1.0.3",
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.0', 'client');

  api.addFiles('facebook_login_button.css', 'client');
  api.addFiles(
    ['facebook_configure.html', 'facebook_configure.js'],
    'client');
});
