Package.describe({
  summary: 'Blaze configuration templates for the Meteor developer accounts OAuth.',
  version: '1.0.3-rc300.9',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles('meteor_developer_login_button.css', 'client');
  api.addFiles(
    ['meteor_developer_configure.html', 'meteor_developer_configure.js'],
    'client'
  );
});
