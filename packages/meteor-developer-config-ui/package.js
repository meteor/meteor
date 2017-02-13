Package.describe({
  summary: 'Blaze configuration templates for the Meteor developer accounts OAuth.',
  version: '1.0.0'
});

Package.onUse(function (api) {
  api.use('templating@1.2.13', 'client');
  api.addFiles('meteor_developer_login_button.css', 'client');
  api.addFiles(
    ['meteor_developer_configure.html', 'meteor_developer_configure.js'],
    'client'
  );
});
