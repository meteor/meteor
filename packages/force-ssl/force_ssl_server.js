// Unfortunately we can't use a connect middleware here since
// sockjs installs itself prior to all existing listeners
// (meaning prior to any connect middlewares) so we need to take
// an approach similar to overshadowListeners in
// https://github.com/sockjs/sockjs-node/blob/cf820c55af6a9953e16558555a31decea554f70e/src/utils.coffee

var httpServer = WebApp.httpServer;
var oldHttpServerListeners = httpServer.listeners('request').slice(0);
httpServer.removeAllListeners('request');
httpServer.addListener('request', function (req, res) {

  // allow connections if they have been handled w/ ssl already
  // (either by us or by a proxy) OR the connection is entirely over
  // localhost (development mode).
  //
  // Note: someone could trick us into serving over non-ssl by setting
  // x-forwarded-for or x-forwarded-proto. Not much we can do there if
  // we still want to operate behind proxies.

  var remoteAddress =
        req.connection.remoteAddress || req.socket.remoteAddress;
  // Determine if the connection is only over localhost. Both we
  // received it on localhost, and all proxies involved received on
  // localhost.
  var localhostRegexp = /^\s*(127\.0\.0\.1|::1)\s*$/;
  var isLocal = (
    localhostRegexp.test(remoteAddress) &&
      (!req.headers['x-forwarded-for'] ||
       _.all(req.headers['x-forwarded-for'].split(','), function (x) {
         return localhostRegexp.test(x);
       })));

  // Determine if the connection was over SSL at any point. Either we
  // received it as SSL, or a proxy did and translated it for us.
  var isSsl = req.connection.pair ||
      (req.headers['x-forwarded-proto'] &&
       req.headers['x-forwarded-proto'].indexOf('https') !== -1);

  if (!isLocal && !isSsl) {
    // connection is not cool. send a 302 redirect!

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

  // connection is OK. Proceed normally.
  var args = arguments;
  _.each(oldHttpServerListeners, function(oldListener) {
    oldListener.apply(httpServer, args);
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
