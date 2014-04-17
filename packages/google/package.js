Package.describe({
  summary: "Google OAuth flow",
  // internal for now. Should be external when it has a richer API to do
  // actual API things with the service, not just handle the OAuth flow.
  internal: true
});

Package.on_use(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use(['underscore', 'service-configuration'], ['client', 'server']);
  // XXX We intended to keep this module separated from accounts-*. But
  // service-configuration pulls in accounts-base anyway (for
  // Accounts.connection), and accounts-base seemed like the best place to
  // put Accounts.withLoginServiceConfiguration for now.
  api.use('accounts-base', 'client');
  api.use(['random', 'templating'], 'client');

  api.export('Google');

  api.add_files(
    ['google_configure.html', 'google_configure.js'],
    'client');

  api.add_files('google_server.js', 'server');
  api.add_files('google_client.js', 'client');
});
