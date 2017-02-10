Package.describe({
  summary: 'Blaze configuration templates for GitHub OAuth.',
  version: '1.0.0'
});

Package.onUse(function (api) {
  api.use('templating@1.2.13', 'client');
  api.addFiles('github_login_button.css', 'client');
  api.addFiles(
    ['github_configure.html', 'github_configure.js'],
    'client'
  );
});
