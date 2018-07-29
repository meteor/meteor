// noinspection NpmUsedModulesInstalled
import { RoutePolicy } from 'meteor/routepolicy';
// noinspection NpmUsedModulesInstalled
import { WebApp } from 'meteor/webapp';
import url from 'url';

// Try load of `uws` Node.js package
/** @type {WebSocket} */
let WebSocket;
try {
  // noinspection NpmUsedModulesInstalled
  WebSocket = require('sc-uws');
} catch (e) {
  console.warn('Run:\nmeteor npm install sc-uws')
}

// noinspection JSUnresolvedVariable
const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
const POSTFIX = '/websocket';

/**
 * StreamServer with uws
 */
class StreamServer {
  constructor() {
    //throw new Meteor.Error('StreamServer break');
    console.log('uws - constructor()');
    this.registration_callbacks = new Set();

    // Because we are installing directly onto WebApp.httpServer instead of using
    // WebApp.app, we have to process the path prefix ourselves.
    this.prefix = pathPrefix + POSTFIX;
    // noinspection JSUnresolvedFunction
    RoutePolicy.declare(this.prefix + '/', 'network');

    // Setup uWS
    const serverOptions = {
      noServer: true
    };
    this.server = new WebSocket.Server(serverOptions);

    // Support the /websocket endpoint
    WebApp.httpServer.on('upgrade', (request, socket, head) => {
      this.upgrade(request, socket, head);
    });

    // On connection
    this.server.on('connection', (socket, req) => {
      this.connection(socket, req);
    });
  }

  /**
   * WebSocket Connection handler
   * @param {WebSocket} socket
   * @param {string[]} socket.headers
   * @param {Function} socket.setWebsocketTimeout
   * @param {IncomingMessage} req
   */
  connection(socket, req) {
    // Debug
    console.log('uws - on connection', socket.readyState);

    // Set headers
    socket.headers = req.headers;

    // Don't setup socket timeout, just create empty function
    socket.setWebsocketTimeout = () => {};

    // XXX COMPAT WITH 0.6.6. Send the old style welcome message, which
    // will force old clients to reload. Remove this once we're not
    // concerned about people upgrading from a pre-0.7.0 release. Also,
    // remove the clause in the client that ignores the welcome message
    // (livedata_connection.js)
    socket.send(JSON.stringify({server_id: '0'}));

    // call all our callbacks when we get a new socket. they will do the
    // work of setting up handlers and such for specific messages.
    this.registration_callbacks.forEach((callback) => {
      console.log('uws - callback');
      callback(socket);
    });
  }

  register(callback) {
    console.log('uws - register()');
    this.registration_callbacks.add(callback);
    this.server.clients.forEach((socket, index) => {
      console.log('uws - register() - client', index);
      callback(socket);
    });
  }

  /**
   * HTTP Upgrade handler
   * @param {IncomingMessage} request
   * @param {Socket} socket
   * @param {Function} socket.destroy
   * @param head
   */
  upgrade(request, socket, head) {
    const pathname = url.parse(request.url).pathname;

    if (pathname === this.prefix) {
      this.server.handleUpgrade(request, socket, head, (ws) => {
        console.log('uws - handle upgrade');
        this.server.emit('connection', ws, request);
      });
    } else {
      console.log('uws - destroy socket');
      socket.destroy();
    }
  }
}

// Stream server will be added only if Node.js module was installed
if (typeof WebSocket !== 'undefined') {
  StreamServers.push(
    StreamServer
  );
  console.log('`stream-server-uws` added to StreamServers');
}

