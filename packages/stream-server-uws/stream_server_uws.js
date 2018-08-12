// noinspection NpmUsedModulesInstalled
import { RoutePolicy } from 'meteor/routepolicy';
// noinspection NpmUsedModulesInstalled
import { WebApp } from 'meteor/webapp';
/** @type {WebSocket} */
// noinspection NpmUsedModulesInstalled
import WebSocket from 'uws';

// noinspection JSUnresolvedVariable
const pathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
const PATH = '/websocket';
const UWS_SERVER_OPTIONS = {
  path: pathPrefix + PATH,
  server: WebApp.httpServer,
};

/**
 * StreamServer with uws
 * @description We using the global variable `StreamServerUWS`
 * because Meteor package compiler creating empty `var StreamServer;` before `export StreamServerUWS`,
 * and it made the import/export mechanism broken
 * @class
 * @type {StreamServerUWS}
 */
StreamServerUWS = class StreamServerUWS {
  /** @param {WebSocket.IServerOptions} options */
  constructor(options = UWS_SERVER_OPTIONS) {
    this.registration_callbacks = new Set();

    // Because we are installing directly onto WebApp.httpServer instead of using
    // WebApp.app, we have to process the path prefix ourselves.
    // noinspection JSUnresolvedFunction
    RoutePolicy.declare(options.path + '/', 'network');

    // Setup uWS
    this.server = new WebSocket.Server(options);

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
      callback(socket);
    });
  }

  register(callback) {
    this.registration_callbacks.add(callback);
    this.server.clients.forEach((socket) => {
      callback(socket);
    });
  }
};