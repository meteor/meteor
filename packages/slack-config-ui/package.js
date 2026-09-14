Package.describe({
  summary: 'Blaze configuration templates for Slack OAuth.',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles(
    ['slack_configure.html', 'slack_configure.js'],
    'client'
  );
});
