Package.describe({
  summary: "Require this application to use secure transport (HTTPS)"
});

Package.on_use(function (api) {
  api.use('webapp', 'server');
  api.use('underscore', 'server');
  // make sure we come after livedata, so we load after the sockjs
  // server has been instantiated.
  api.use('livedata', 'server');

  api.add_files('force_ssl_common.js', ['client', 'server']);
  api.add_files('force_ssl_server.js', 'server');

  // Another thing we could do is add a force_ssl_client.js file that
  // makes sure document.location.protocol is 'https'. If it detected
  // the code was loaded from a non-localhost non-https site, it would
  // stop the app from working and pop up an error box or something.
});
