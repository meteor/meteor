Package.describe({
  summary: 'Blaze configuration templates for the Meetup OAuth flow.',
  version: '1.0.1',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.2.13', 'client');
  api.addFiles('meetup_login_button.css', 'client');
  api.addFiles(
    ['meetup_configure.html', 'meetup_configure.js'],
    'client'
  );
});
