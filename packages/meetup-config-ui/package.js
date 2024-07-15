Package.describe({
  summary: 'Blaze configuration templates for the Meetup OAuth flow.',
  version: '1.0.3',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles('meetup_login_button.css', 'client');
  api.addFiles(
    ['meetup_configure.html', 'meetup_configure.js'],
    'client'
  );
});
