Package.describe({
  summary: "Require this application to use HTTPS",
  version: "1.0.6"
});

Package.onUse(function (api) {
  api.use('webapp', 'server');
  api.use('underscore');
  // make sure we come after livedata, so we load after the sockjs
  // server has been instantiated.
  api.use('ddp', 'server');

  api.addFiles('force_ssl_common.js', ['client', 'server']);
  api.addFiles('force_ssl_server.js', 'server');

  // Another thing we could do is add a force_ssl_client.js file that
  // makes sure document.location.protocol is 'https'. If it detected
  // the code was loaded from a non-localhost non-https site, it would
  // stop the app from working and pop up an error box or something.
});
