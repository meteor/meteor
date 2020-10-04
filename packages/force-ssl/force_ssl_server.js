var url = Npm.require("url");
import { isLocalConnection, isSslConnection } from 'meteor/force-ssl-common';

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
  // x-forwarded-for, x-forwarded-proto, forwarded, etc. Not much we can do
  // there if we still want to operate behind proxies.

  if (!isLocalConnection(req) && !isSslConnection(req)) {
    // connection is not cool. send a 302 redirect!

    var host = url.parse(Meteor.absoluteUrl()).hostname;

    // strip off the port number. If we went to a URL with a custom
    // port, we don't know what the custom SSL port is anyway.
    host = host.replace(/:\d+$/, '');

    res.writeHead(302, {
      'Location': 'https://' + host + req.url,
      'Access-Control-Allow-Origin': '*'
    });
    res.end();
    return;
  }

  // connection is OK. Proceed normally.
  var args = arguments;
  oldHttpServerListeners.forEach((oldListener) => {
    oldListener.apply(httpServer, args);
  });
});


// NOTE: this doesn't handle websockets!
//
// Websockets come in via the 'upgrade' request. We can override this,
// however the problem is we're not sure if the websocket is actually
// encrypted. We don't get x-forwarded-for, x-forwarded-proto, forwarded, etc.
// on websockets. It's possible the 'sec-websocket-origin' header does
// what we want, but that's not clear.
//
// For now, this package allows raw unencrypted DDP connections over
// websockets.
