Package.describe({
  summary: 'Blaze configuration templates for the Meteor developer accounts OAuth.',
  version: '2.0.0-alpha300.7',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@2.0.0-alpha300.5', 'client');
  api.addFiles('meteor_developer_login_button.css', 'client');
  api.addFiles(
    ['meteor_developer_configure.html', 'meteor_developer_configure.js'],
    'client'
  );
});
