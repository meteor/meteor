Package.describe({
  summary: 'Blaze configuration templates for GitHub OAuth.',
  version: '2.0.0-alpha300.3',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.0', 'client');
  api.addFiles('github_login_button.css', 'client');
  api.addFiles(
    ['github_configure.html', 'github_configure.js'],
    'client'
  );
});
