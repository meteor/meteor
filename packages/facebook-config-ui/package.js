Package.describe({
  summary: "Blaze configuration templates for Facebook OAuth.",
  version: '1.0.4-alpha300.11',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@2.0.0-alpha300.5', 'client');

  api.addFiles('facebook_login_button.css', 'client');
  api.addFiles(
    ['facebook_configure.html', 'facebook_configure.js'],
    'client');
});
