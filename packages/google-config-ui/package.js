Package.describe({
  summary: 'Blaze configuration templates for Google OAuth.',
  version: '2.0.0-alpha300.3',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.1', 'client');

  api.addFiles('google_login_button.css', 'client');
  api.addFiles(['google_configure.html', 'google_configure.js'], 'client');
});
