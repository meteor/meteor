Package.describe({
  summary: 'Blaze configuration templates for Google OAuth.',
  version: '2.0.0-alpha300.10',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@2.0.0-alpha300.5', 'client');

  api.addFiles('google_login_button.css', 'client');
  api.addFiles(['google_configure.html', 'google_configure.js'], 'client');
});
