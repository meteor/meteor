Package.describe({
  summary: 'Blaze configuration templates for the Meetup OAuth flow.',
  version: '1.0.3-alpha300.11',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@2.0.0-alpha300.5', 'client');
  api.addFiles('meetup_login_button.css', 'client');
  api.addFiles(
    ['meetup_configure.html', 'meetup_configure.js'],
    'client'
  );
});
