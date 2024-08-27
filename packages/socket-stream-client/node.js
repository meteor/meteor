import { Meteor } from "meteor/meteor";
import { toWebsocketUrl } from "./urls.js";
import { StreamClientCommon } from "./common.js";

// @param endpoint {String} URL to Meteor app
//   "http://subdomain.meteor.com/" or "/" or
//   "ddp+sockjs://foo-**.meteor.com/sockjs"
//
// We do some rewriting of the URL to eventually make it "ws://" or "wss://",
// whatever was passed in.  At the very least, what Meteor.absoluteUrl() returns
// us should work.
//
// We don't do any heartbeating. (The logic that did this in sockjs was removed,
// because it used a built-in sockjs mechanism. We could do it with WebSocket
// ping frames or with DDP-level messages.)
export class ClientStream extends StreamClientCommon {
  constructor(endpoint, options) {
    super(options);

    this.client = null; // created in _launchConnection
    this.endpoint = endpoint;

    this.headers = this.options.headers || {};
    this.npmFayeOptions = this.options.npmFayeOptions || {};

    this._initCommon(this.options);

    //// Kickoff!
    this._launchConnection();
  }

  // data is a utf8 string. Data sent while not connected is dropped on
  // the floor, and it is up the user of this API to retransmit lost
  // messages on 'reset'
  send(data) {
    if (this.currentStatus.connected) {
      this.client.send(data);
    }
  }

  // Changes where this connection points
  _changeUrl(url) {
    this.endpoint = url;
  }

  _onConnect(client) {
    if (client !== this.client) {
      // This connection is not from the last call to _launchConnection.
      // But _launchConnection calls _cleanup which closes previous connections.
      // It's our belief that this stifles future 'open' events, but maybe
      // we are wrong?
      throw new Error('Got open from inactive client ' + !!this.client);
    }

    if (this._forcedToDisconnect) {
      // We were asked to disconnect between trying to open the connection and
      // actually opening it. Let's just pretend this never happened.
      this.client.close();
      this.client = null;
      return;
    }

    if (this.currentStatus.connected) {
      // We already have a connection. It must have been the case that we
      // started two parallel connection attempts (because we wanted to
      // 'reconnect now' on a hanging connection and we had no way to cancel the
      // connection attempt.) But this shouldn't happen (similarly to the client
      // !== this.client check above).
      throw new Error('Two parallel connections?');
    }

    this._clearConnectionTimer();

    // update status
    this.currentStatus.status = 'connected';
    this.currentStatus.connected = true;
    this.currentStatus.retryCount = 0;
    this.statusChanged();

    // fire resets. This must come after status change so that clients
    // can call send from within a reset callback.
    this.forEachCallback('reset', callback => {
      callback();
    });
  }

  _cleanup(maybeError) {
    this._clearConnectionTimer();
    if (this.client) {
      var client = this.client;
      this.client = null;
      client.close();

      this.forEachCallback('disconnect', callback => {
        callback(maybeError);
      });
    }
  }

  _clearConnectionTimer() {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  _getProxyUrl(targetUrl) {
    // Similar to code in tools/http-helpers.js.
    var proxy = process.env.HTTP_PROXY || process.env.http_proxy || null;
    var noproxy = process.env.NO_PROXY || process.env.no_proxy || null;
    // if we're going to a secure url, try the https_proxy env variable first.
    if (targetUrl.match(/^wss:/) || targetUrl.match(/^https:/)) {
      proxy = process.env.HTTPS_PROXY || process.env.https_proxy || proxy;
    }
    if (targetUrl.indexOf('localhost') != -1 || targetUrl.indexOf('127.0.0.1') != -1) {
      return null;
    }
    if (noproxy) {
      for (let item of noproxy.split(',')) {
        if (targetUrl.indexOf(item.trim().replace(/\*/, '')) !== -1) {
          proxy = null;
        }
      }
    }
    return proxy;
  }

  _launchConnection() {
    this._cleanup(); // cleanup the old socket, if there was one.

    // Since server-to-server DDP is still an experimental feature, we only
    // require the module if we actually create a server-to-server
    // connection.
    var FayeWebSocket = Npm.require('faye-websocket');

    var targetUrl = toWebsocketUrl(this.endpoint);
    var fayeOptions = {
      headers: this.headers,
      extensions: []
    };
    fayeOptions = Object.assign(fayeOptions, this.npmFayeOptions);
    var proxyUrl = this._getProxyUrl(targetUrl);
    if (proxyUrl) {
      fayeOptions.proxy = { origin: proxyUrl };
    }

    // We would like to specify 'ddp' as the subprotocol here. The npm module we
    // used to use as a client would fail the handshake if we ask for a
    // subprotocol and the server doesn't send one back (and sockjs doesn't).
    // Faye doesn't have that behavior; it's unclear from reading RFC 6455 if
    // Faye is erroneous or not.  So for now, we don't specify protocols.
    var subprotocols = [];

    var client = (this.client = new FayeWebSocket.Client(
      targetUrl,
      subprotocols,
      fayeOptions
    ));

    this._clearConnectionTimer();
    this.connectionTimer = Meteor.setTimeout(() => {
      this._lostConnection(new this.ConnectionError('DDP connection timed out'));
    }, this.CONNECT_TIMEOUT);

    this.client.on(
      'open',
      Meteor.bindEnvironment(() => {
        return this._onConnect(client);
      }, 'stream connect callback')
    );

    var clientOnIfCurrent = (event, description, callback) => {
      this.client.on(
        event,
        Meteor.bindEnvironment((...args) => {
          // Ignore events from any connection we've already cleaned up.
          if (client !== this.client) return;
          callback(...args);
        }, description)
      );
    };

    clientOnIfCurrent('error', 'stream error callback', error => {
      if (!this.options._dontPrintErrors)
        Meteor._debug('stream error', error.message);

      // Faye's 'error' object is not a JS error (and among other things,
      // doesn't stringify well). Convert it to one.
      this._lostConnection(new this.ConnectionError(error.message));
    });

    clientOnIfCurrent('close', 'stream close callback', () => {
      this._lostConnection();
    });

    clientOnIfCurrent('message', 'stream message callback', message => {
      // Ignore binary frames, where message.data is a Buffer
      if (typeof message.data !== 'string') return;

      this.forEachCallback('message', callback => {
        callback(message.data);
      });
    });
  }
}
