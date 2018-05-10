import { Hook } from 'meteor/callback-hook';
import StreamServer from "./stream_server.js";
import Session from "./session.js";
import { maybeAuditArgumentChecks } from "./common.js";
const Fiber = Npm.require("fibers");

export function calculateVersion(
  clientSupportedVersions,
  serverSupportedVersions
) {

  let correctVersion = _.find(clientSupportedVersions, function (version) {
    return _.contains(serverSupportedVersions, version);
  });

  if (!correctVersion) {
    correctVersion = serverSupportedVersions[0];
  }

  return correctVersion;
}

export default class Server {
  constructor(options) {
    var self = this;

    // The default heartbeat interval is 30 seconds on the server and 35
    // seconds on the client.  Since the client doesn't need to send a
    // ping as long as it is receiving pings, this means that pings
    // normally go from the server to the client.
    //
    // Note: Troposphere depends on the ability to mutate
    // Meteor.server.options.heartbeatTimeout! This is a hack, but it's life.
    self.options = _.defaults(options || {}, {
      heartbeatInterval: 15000,
      heartbeatTimeout: 15000,
      // For testing, allow responding to pings to be disabled.
      respondToPings: true
    });

    // Map of callbacks to call when a new connection comes in to the
    // server and completes DDP version negotiation. Use an object instead
    // of an array so we can safely remove one from the list while
    // iterating over it.
    self.onConnectionHook = new Hook({
      debugPrintExceptions: "onConnection callback"
    });

    // Map of callbacks to call when a new message comes in.
    self.onMessageHook = new Hook({
      debugPrintExceptions: "onMessage callback"
    });

    self.publish_handlers = {};
    self.universal_publish_handlers = [];

    self.method_handlers = {};

    self.sessions = {}; // map from id to session

    self.stream_server = new StreamServer();

    self.stream_server.register(function (socket) {
      // socket implements the SockJSConnection interface
      socket._meteorSession = null;

      var sendError = function (reason, offendingMessage) {
        var msg = {msg: 'error', reason: reason};
        if (offendingMessage)
          msg.offendingMessage = offendingMessage;
        socket.send(DDPCommon.stringifyDDP(msg));
      };

      socket.on('data', function (raw_msg) {
        if (Meteor._printReceivedDDP) {
          Meteor._debug("Received DDP", raw_msg);
        }
        try {
          try {
            var messages = DDPCommon.parseDDP(raw_msg);
          } catch (err) {
            sendError('Parse error');
            return;
          }

          // Convert all DDP messages to Array form
          messages = Array.isArray(messages) ? messages : [messages];

          for (var i = 0; i < messages.length; i++) {
            var msg = messages[i];

            if (msg === null || !msg.msg) {
              sendError('Bad request', msg);
              return;
            }

            if (msg.msg === 'connect') {
              if (socket._meteorSession) {
                sendError("Already connected", msg);
                return;
              }
              Fiber(function () {
                self._handleConnect(socket, msg);
              }).run();
              return;
            }

            socket._meteorSession.processMessage(msg);
          }

          if (!socket._meteorSession) {
            sendError('Must connect first', messages);
            return;
          }
        } catch (e) {
          // XXX print stack nicely
          Meteor._debug("Internal exception while processing message(s)",
            messages, e.message, e.stack);
        }
      });

      socket.on('close', function () {
        if (socket._meteorSession) {
          Fiber(function () {
            socket._meteorSession.close();
          }).run();
        }
      });
    });
  }

  /**
   * @summary Register a callback to be called when a new DDP connection is made to the server.
   * @locus Server
   * @param {function} callback The function to call when a new DDP connection is established.
   * @memberOf Meteor
   * @importFromPackage meteor
   */
  onConnection(fn) {
    var self = this;
    return self.onConnectionHook.register(fn);
  }

  /**
   * @summary Register a callback to be called when a new DDP message is received.
   * @locus Server
   * @param {function} callback The function to call when a new DDP message is received.
   * @memberOf Meteor
   * @importFromPackage meteor
   */
  onMessage(fn) {
    var self = this;
    return self.onMessageHook.register(fn);
  }

  _handleConnect(socket, msg) {
    var self = this;

    // The connect message must specify a version and an array of supported
    // versions, and it must claim to support what it is proposing.
    if (!(typeof (msg.version) === 'string' &&
          _.isArray(msg.support) &&
          _.all(msg.support, _.isString) &&
          _.contains(msg.support, msg.version))) {
      socket.send(DDPCommon.stringifyDDP({msg: 'failed',
                                version: DDPCommon.SUPPORTED_DDP_VERSIONS[0]}));
      socket.close();
      return;
    }

    // In the future, handle session resumption: something like:
    //  socket._meteorSession = self.sessions[msg.session]
    var version = calculateVersion(msg.support, DDPCommon.SUPPORTED_DDP_VERSIONS);

    if (msg.version !== version) {
      // The best version to use (according to the client's stated preferences)
      // is not the one the client is trying to use. Inform them about the best
      // version to use.
      socket.send(DDPCommon.stringifyDDP({msg: 'failed', version: version}));
      socket.close();
      return;
    }

    var allowBatching = msg.allowBatching;

    // Yay, version matches! Create a new session.
    // Note: Troposphere depends on the ability to mutate
    // Meteor.server.options.heartbeatTimeout! This is a hack, but it's life.
    socket._meteorSession = new Session(self, version, socket, self.options, allowBatching);
    self.sessions[socket._meteorSession.id] = socket._meteorSession;
    self.onConnectionHook.each(function (callback) {
      if (socket._meteorSession)
        callback(socket._meteorSession.connectionHandle);
      return true;
    });
  }

  /**
   * Register a publish handler function.
   *
   * @param name {String} identifier for query
   * @param handler {Function} publish handler
   * @param options {Object}
   *
   * Server will call handler function on each new subscription,
   * either when receiving DDP sub message for a named subscription, or on
   * DDP connect for a universal subscription.
   *
   * If name is null, this will be a subscription that is
   * automatically established and permanently on for all connected
   * client, instead of a subscription that can be turned on and off
   * with subscribe().
   *
   * options to contain:
   *  - (mostly internal) is_auto: true if generated automatically
   *    from an autopublish hook. this is for cosmetic purposes only
   *    (it lets us determine whether to print a warning suggesting
   *    that you turn off autopublish.)
   */

  /**
   * @summary Publish a record set.
   * @memberOf Meteor
   * @importFromPackage meteor
   * @locus Server
   * @param {String|Object} name If String, name of the record set.  If Object, publications Dictionary of publish functions by name.  If `null`, the set has no name, and the record set is automatically sent to all connected clients.
   * @param {Function} func Function called on the server each time a client subscribes.  Inside the function, `this` is the publish handler object, described below.  If the client passed arguments to `subscribe`, the function is called with the same arguments.
   */
  publish(name, handler, options) {
    var self = this;

    if (! _.isObject(name)) {
      options = options || {};

      if (name && name in self.publish_handlers) {
        Meteor._debug("Ignoring duplicate publish named '" + name + "'");
        return;
      }

      if (Package.autopublish && !options.is_auto) {
        // They have autopublish on, yet they're trying to manually
        // picking stuff to publish. They probably should turn off
        // autopublish. (This check isn't perfect -- if you create a
        // publish before you turn on autopublish, it won't catch
        // it. But this will definitely handle the simple case where
        // you've added the autopublish package to your app, and are
        // calling publish from your app code.)
        if (!self.warned_about_autopublish) {
          self.warned_about_autopublish = true;
          Meteor._debug(
    "** You've set up some data subscriptions with Meteor.publish(), but\n" +
    "** you still have autopublish turned on. Because autopublish is still\n" +
    "** on, your Meteor.publish() calls won't have much effect. All data\n" +
    "** will still be sent to all clients.\n" +
    "**\n" +
    "** Turn off autopublish by removing the autopublish package:\n" +
    "**\n" +
    "**   $ meteor remove autopublish\n" +
    "**\n" +
    "** .. and make sure you have Meteor.publish() and Meteor.subscribe() calls\n" +
    "** for each collection that you want clients to see.\n");
        }
      }

      if (name)
        self.publish_handlers[name] = handler;
      else {
        self.universal_publish_handlers.push(handler);
        // Spin up the new publisher on any existing session too. Run each
        // session's subscription in a new Fiber, so that there's no change for
        // self.sessions to change while we're running this loop.
        _.each(self.sessions, function (session) {
          if (!session._dontStartNewUniversalSubs) {
            Fiber(function() {
              session._startSubscription(handler);
            }).run();
          }
        });
      }
    }
    else{
      _.each(name, function(value, key) {
        self.publish(key, value, {});
      });
    }
  }

  _removeSession(session) {
    var self = this;
    if (self.sessions[session.id]) {
      delete self.sessions[session.id];
    }
  }

  /**
   * @summary Defines functions that can be invoked over the network by clients.
   * @locus Anywhere
   * @param {Object} methods Dictionary whose keys are method names and values are functions.
   * @memberOf Meteor
   * @importFromPackage meteor
   */
  methods(methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (typeof func !== 'function')
        throw new Error("Method '" + name + "' must be a function");
      if (self.method_handlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self.method_handlers[name] = func;
    });
  }

  call(name, ...args) {
    if (args.length && typeof args[args.length - 1] === "function") {
      // If it's a function, the last argument is the result callback, not
      // a parameter to the remote method.
      var callback = args.pop();
    }

    return this.apply(name, args, callback);
  }

  // A version of the call method that always returns a Promise.
  callAsync(name, ...args) {
    return this.applyAsync(name, args);
  }

  apply(name, args, options, callback) {
    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (! callback && typeof options === 'function') {
      callback = options;
      options = {};
    } else {
      options = options || {};
    }

    const promise = this.applyAsync(name, args, options);

    // Return the result in whichever way the caller asked for it. Note that we
    // do NOT block on the write fence in an analogous way to how the client
    // blocks on the relevant data being visible, so you are NOT guaranteed that
    // cursor observe callbacks have fired when your callback is invoked. (We
    // can change this if there's a real use case.)
    if (callback) {
      promise.then(
        result => callback(undefined, result),
        exception => callback(exception)
      );
    } else {
      return promise.await();
    }
  }

  // @param options {Optional Object}
  applyAsync(name, args, options) {
    // Run the handler
    var handler = this.method_handlers[name];
    if (! handler) {
      return Promise.reject(
        new Meteor.Error(404, `Method '${name}' not found`)
      );
    }

    // If this is a method call from within another method or publish function,
    // get the user state from the outer method or publish function, otherwise
    // don't allow setUserId to be called
    var userId = null;
    var setUserId = function() {
      throw new Error("Can't call setUserId on a server initiated method call");
    };
    var connection = null;
    var currentMethodInvocation = DDP._CurrentMethodInvocation.get();
    var currentPublicationInvocation = DDP._CurrentPublicationInvocation.get();
    var randomSeed = null;
    if (currentMethodInvocation) {
      userId = currentMethodInvocation.userId;
      setUserId = function(userId) {
        currentMethodInvocation.setUserId(userId);
      };
      connection = currentMethodInvocation.connection;
      randomSeed = DDPCommon.makeRpcSeed(currentMethodInvocation, name);
    } else if (currentPublicationInvocation) {
      userId = currentPublicationInvocation.userId;
      setUserId = function(userId) {
        currentPublicationInvocation._session._setUserId(userId);
      };
      connection = currentPublicationInvocation.connection;
    }

    var invocation = new DDPCommon.MethodInvocation({
      isSimulation: false,
      userId,
      setUserId,
      connection,
      randomSeed
    });

    return new Promise(resolve => resolve(
      DDP._CurrentMethodInvocation.withValue(
        invocation,
        () => maybeAuditArgumentChecks(
          handler, invocation, EJSON.clone(args),
          "internal call to '" + name + "'"
        )
      )
    )).then(EJSON.clone);
  }

  _urlForSession(sessionId) {
    var self = this;
    var session = self.sessions[sessionId];
    if (session)
      return session._socketUrl;
    else
      return null;
  }
}
