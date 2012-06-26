(function () {
  // Unfortunately we can't use a connect middleware here since
  // sockjs installs itself prior to all existing listeners
  // (meaning prior to any connect middlewares) so we need to take
  // an approach similar to overshadowListeners in
  // https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee

  var app = __meteor_bootstrap__.app;
  var oldAppListeners = app.listeners('request').slice(0);
  app.removeAllListeners('request');
  app.addListener('request', function (req, res) {

    // allow connections if any of:
    // - they are already ssl.
    // - they are only over localhost and don't hit real network.
    // - they were handled by a proxy layer that did ssl.
    //
    // Note: someone could trick us into serving over non-ssl by setting
    // x-forwarded-for or x-forwarded-proto. Not much we can do there if
    // we still want to operate behind proxies.

    var remoteAddress =
          req.connection.remoteAddress || req.socket.remoteAddress;
    var isLocal = (
      remoteAddress === "127.0.0.1" &&
        (!req.headers['x-forwarded-for'] ||
         _.all(req.headers['x-forwarded-for'].split(','), function (x) {
           return /\s*127\.0\.0\.1\s*/.test(x);
         })));

    if (!req.connection.pair &&
        !isLocal &&
        ( !req.headers['x-forwarded-proto'] ||
          req.headers['x-forwarded-proto'].indexOf('https') === -1 ) )
    {
      // if we don't have a host header, there's not a lot we can do. We
      // don't know how to redirect them.
      // XXX can we do better here?
      var host = req.headers.host || 'no-host-header';

      // strip off the port number. If we went to a URL with a custom
      // port, we don't know what the custom SSL port is anyway.
      host = host.replace(/:\d+$/, '');

      res.writeHead(302, {
        'Location': 'https://' + host + req.url
      });
      res.end();
      return;
    }

    var args = arguments;
    _.each(oldAppListeners, function(oldListener) {
      oldListener.apply(app, args);
    });
  });


  // NOTE: this doesn't handle websockets!
  //
  // Websockets come in via the 'upgrade' request. We can override this,
  // however the problem is we're not sure if the websocket is actually
  // encrypted. We don't get x-forwarded-for or x-forwarded-proto on
  // websockets. It's possible the 'sec-websocket-origin' header does
  // what we want, but that's not clear.
  //
  // For now, this package allows raw unencrypted DDP connections over
  // websockets.

})();
