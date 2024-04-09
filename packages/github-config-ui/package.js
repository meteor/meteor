Package.describe({
  summary: 'Blaze configuration templates for GitHub OAuth.',
  version: '1.0.3-beta300.7',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles('github_login_button.css', 'client');
  api.addFiles(
    ['github_configure.html', 'github_configure.js'],
    'client'
  );
});
