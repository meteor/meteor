Package.describe({
  summary: 'Blaze configuration templates for the Meetup OAuth flow.',
  version: '1.0.0'
});

Package.onUse(function (api) {
  api.use('templating@1.2.13', 'client');
  api.addFiles('meetup_login_button.css', 'client');
  api.addFiles(
    ['meetup_configure.html', 'meetup_configure.js'],
    'client'
  );
});
