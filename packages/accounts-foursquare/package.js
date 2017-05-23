Package.describe({
  summary: "Login service for Foursquare accounts"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('accounts-oauth2-helper', ['client', 'server']);
  api.use('http', ['client', 'server']);
  api.use('templating', 'client');

  api.add_files(
    ['foursquare_login_button.css', 'foursquare_configure.html', 'foursquare_configure.js'],
    'client');
  
  api.add_files('foursquare_common.js', ['client', 'server']);
  api.add_files('foursquare_server.js', 'server');
  api.add_files('foursquare_client.js', 'client');
});
