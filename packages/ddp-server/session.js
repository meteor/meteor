import SessionCollectionView from "./session_collection_view";
import Subscription from "./subscription";

export default class Session {
    constructor(server, version, socket, options){
        this.id = Random.id();
  
        this.server = server;
        this.version = version;
      
        this.initialized = false;
        this.socket = socket;
      
        // set to null when the session is destroyed. multiple places below
        // use this to determine if the session is alive or not.
        this.inQueue = new Meteor._DoubleEndedQueue();
      
        this.blocked = false;
        this.workerRunning = false;
      
        // Sub objects for active subscriptions
        this._namedSubs = new Map();
        this._universalSubs = [];
      
        this.userId = null;
      
        this.collectionViews = new Map();
      
        // Set this to false to not send messages when collectionViews are
        // modified. This is done when rerunning subs in _setUserId and those messages
        // are calculated via a diff instead.
        this._isSending = true;
      
        // If this is true, don't start a newly-created universal publisher on this
        // session. The session will take care of starting it when appropriate.
        this._dontStartNewUniversalSubs = false;
      
        // when we are rerunning subscriptions, any ready messages
        // we want to buffer up for when we are done rerunning subscriptions
        this._pendingReady = [];
      
        // List of callbacks to call when this connection is closed.
        this._closeCallbacks = [];
      
      
        // XXX HACK: If a sockjs connection, save off the URL. This is
        // temporary and will go away in the near future.
        this._socketUrl = socket.url;
      
        // Allow tests to disable responding to pings.
        this._respondToPings = options.respondToPings;

    // This object is the public interface to the session. In the public
    // API, it is called the `connection` object.  Internally we call it
    // a `connectionHandle` to avoid ambiguity.
    this.connectionHandle = {
        id: this.id,
        close() {
          this.close();
        },
        onClose(fn) {
          var cb = Meteor.bindEnvironment(fn, "connection onClose callback");
          if (this.inQueue) {
            this._closeCallbacks.push(cb);
          } else {
            // if we're already closed, call the callback.
            Meteor.defer(cb);
          }
        },
        clientAddress: this._clientAddress(),
        httpHeaders: this.socket.headers
      };

      if (version !== 'pre1' && options.heartbeatInterval !== 0) {
        // We no longer need the low level timeout because we have heartbeating.
        socket.setWebsocketTimeout(0);
    
        this.heartbeat = new DDPCommon.Heartbeat({
          heartbeatInterval: options.heartbeatInterval,
          heartbeatTimeout: options.heartbeatTimeout,
          onTimeout() {
            this.close();
          },
          sendPing() {
            this.send({msg: 'ping'});
          }
        });
        this.heartbeat.start();
      }
    
      Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
        "livedata", "sessions", 1);
        this.send({ msg: 'connected', session: this.id })
    }
  
  static sendReady(subscriptionIds) {
    this._isSending ?
      this.send({msg: "ready", subs: subscriptionIds})
    :
    subscriptionIds.forEach(function (subscriptionId) {
        this._pendingReady = [...this._pendingReady, subscriptionId]
      });
  }

  static sendAdded(collectionName, id, fields) {
    this._isSending &&
      this.send({msg: "added", collection: collectionName, id: id, fields: fields});
  }

  static sendChanged(collectionName, id, fields) {
    if (_.isEmpty(fields))
      return;

    this._isSending &&
      this.send({
        msg: "changed",
        collection: collectionName,
        id: id,
        fields: fields
      });
  }

  static sendRemoved(collectionName, id) {
    this._isSending &&
      this.send({msg: "removed", collection: collectionName, id: id});
  }

  static getSendCallbacks = () => ({
    added: this.sendAdded.bind(this),
    changed: this.sendChanged.bind(this),
    removed: this.sendRemoved.bind(this)
  })

  static getCollectionView(collectionName) {
    return this.collectionViews?.collectionName ?? (() => {
      const createNewSessionCollectionView = new SessionCollectionView(collectionName,
        this.getSendCallbacks());
        this.collectionViews.set(collectionName, createNewSessionCollectionView);
    })
  }

  static added(subscriptionHandle, collectionName, id, fields) {
    this.getCollectionView(collectionName).added(subscriptionHandle, id, fields);
  }

  static removed(subscriptionHandle, collectionName, id) {
    this.getCollectionView(collectionName).removed(subscriptionHandle, id);
    this.emptyCollectionCleanup(collectionName)
  }

  static emptyCollectionCleanup(collectionName){
    this.getCollectionView(collectionName).isEmpty() && this.collectionViews.delete(collectionName);
  }

  static changed(subscriptionHandle, collectionName, id, fields) { 
    this.getCollectionView(collectionName).changed(subscriptionHandle, id, fields);
  }

  static startUniversalSubs() {
    // Make a shallow copy of the set of universal handlers and start them. If
    // additional universal publishers start while we're running them (due to
    // yielding), they will run separately as part of Server.publish.
    Object.assign(this.server.universal_publish_handlers)(function (handler) {
      this._startSubscription(handler);
    });
  }

  // Destroy this session and unregister it at the server.
  static close() {
    // Destroy this session, even if it's not registered at the
    // server. Stop all processing and tear everything down. If a socket
    // was attached, close it.

    // Already destroyed.
    if (! this.inQueue)
      return;

    // Drop the merge box data immediately.
    this.inQueue = null;
    this.collectionViews = new Map();

    if (this.heartbeat) {
      this.heartbeat.stop();
      this.heartbeat = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket._meteorSession = null;
    }

    Package['facts-base'] && Package['facts-base'].Facts.incrementServerFact(
      "livedata", "sessions", -1);

    Meteor.defer(function () {
      // stop callbacks can yield, so we defer this on close.
      // sub._isDeactivated() detects that we set inQueue to null and
      // treats it as semi-deactivated (it will ignore incoming callbacks, etc).
      this._deactivateAllSubscriptions();

      // Defer calling the close callbacks, so that the caller closing
      // the session isn't waiting for all the callbacks to complete.
      this._closeCallbacks.forEach(function (callback) {
        callback();
      });
    });

    // Unregister the session.
    this.server._removeSession(this);
  }

  // Send a message (doing nothing if no socket is connected right now.)
  // It should be a JSON object (it will be stringified.)
  static send(msg) {
    if (this.socket) {
      if (Meteor._printSentDDP)
        Meteor._debug("Sent DDP", DDPCommon.stringifyDDP(msg));
      this.socket.send(DDPCommon.stringifyDDP(msg));
    }
  }

  // Send a connection error.
  static sendError(reason, offendingMessage) {
    
    var msg = {msg: 'error', reason: reason};
    if (offendingMessage)
      msg.offendingMessage = offendingMessage;
    this.send(msg);
  }

  // Process 'msg' as an incoming message. (But as a guard against
  // race conditions during reconnection, ignore the message if
  // 'socket' is not the currently connected socket.)
  //
  // We run the messages from the client one at a time, in the order
  // given by the client. The message handler is passed an idempotent
  // function 'unblock' which it may call to allow other messages to
  // begin running in parallel in another fiber (for example, a method
  // that wants to yield.) Otherwise, it is automatically unblocked
  // when it returns.
  //
  // Actually, we don't have to 'totally order' the messages in this
  // way, but it's the easiest thing that's correct. (unsub needs to
  // be ordered against sub, methods need to be ordered against each
  // other.)
  static processMessage(msg_in) {
    
    if (!this.inQueue) // we have been destroyed.
      return;

    // Respond to ping and pong messages immediately without queuing.
    // If the negotiated DDP version is "pre1" which didn't support
    // pings, preserve the "pre1" behavior of responding with a "bad
    // request" for the unknown messages.
    //
    // Fibers are needed because heartbeat uses Meteor.setTimeout, which
    // needs a Fiber. We could actually use regular setTimeout and avoid
    // these new fibers, but it is easier to just make everything use
    // Meteor.setTimeout and not think too hard.
    //
    // Any message counts as receiving a pong, as it demonstrates that
    // the client is still alive.
    if (this.heartbeat) {
      Fiber(function () {
        this.heartbeat.messageReceived();
      }).run();
    }

    if (this.version !== 'pre1' && msg_in.msg === 'ping') {
      if (this._respondToPings)
        this.send({msg: "pong", id: msg_in.id});
      return;
    }
    if (this.version !== 'pre1' && msg_in.msg === 'pong') {
      // Since everything is a pong, nothing to do
      return;
    }

    this.inQueue.push(msg_in);
    if (this.workerRunning)
      return;
    this.workerRunning = true;

    var processNext = function () {
      var msg = this.inQueue && this.inQueue.shift();
      if (!msg) {
        this.workerRunning = false;
        return;
      }

      Fiber(function () {
        var blocked = true;

        var unblock = function () {
          if (!blocked)
            return; // idempotent
          blocked = false;
          processNext();
        };

        this.server.onMessageHook.each(function (callback) {
          callback(msg, this);
          return true;
        });

        if (_.has(this.protocol_handlers, msg.msg))
          this.protocol_handlers[msg.msg].call(this, msg, unblock);
        else
          this.sendError('Bad request', msg);
        unblock(); // in case the handler didn't already do it
      }).run();
    };

    processNext();
  }

  static protocol_handlers(){
    return {
        sub(msg) {
        // reject malformed messages
        if (typeof (msg.id) !== "string" ||
            typeof (msg.name) !== "string" ||
            (('params' in msg) && !(msg.params instanceof Array))) {
            this.sendError("Malformed subscription", msg);
            return;
        }

        if (!this.server.publish_handlers[msg.name]) {
            this.send({
            msg: 'nosub', id: msg.id,
            error: new Meteor.Error(404, `Subscription '${msg.name}' not found`)});
            return;
        }

        if (this._namedSubs.has(msg.id))
            // subs are idempotent, or rather, they are ignored if a sub
            // with that id already exists. this is important during
            // reconnect.
            return;

        // XXX It'd be much better if we had generic hooks where any package can
        // hook into subscription handling, but in the mean while we special case
        // ddp-rate-limiter package. This is also done for weak requirements to
        // add the ddp-rate-limiter package in case we don't have Accounts. A
        // user trying to use the ddp-rate-limiter must explicitly require it.
        if (Package['ddp-rate-limiter']) {
            var DDPRateLimiter = Package['ddp-rate-limiter'].DDPRateLimiter;
            var rateLimiterInput = {
            userId: this.userId,
            clientAddress: this.connectionHandle.clientAddress,
            type: "subscription",
            name: msg.name,
            connectionId: this.id
            };

            DDPRateLimiter._increment(rateLimiterInput);
            var rateLimitResult = DDPRateLimiter._check(rateLimiterInput);
            if (!rateLimitResult.allowed) {
            this.send({
                msg: 'nosub', id: msg.id,
                error: new Meteor.Error(
                'too-many-requests',
                DDPRateLimiter.getErrorMessage(rateLimitResult),
                {timeToReset: rateLimitResult.timeToReset})
            });
            return;
            }
        }

        var handler = this.server.publish_handlers[msg.name];

        this._startSubscription(handler, msg.id, msg.params, msg.name);

        },
        unsub(msg){
        this._stopSubscription(msg.id);
        },
        method(msg, unblock) {
        

        // reject malformed messages
        // For now, we silently ignore unknown attributes,
        // for forwards compatibility.
        if (typeof (msg.id) !== "string" ||
            typeof (msg.method) !== "string" ||
            (('params' in msg) && !(msg.params instanceof Array)) ||
            (('randomSeed' in msg) && (typeof msg.randomSeed !== "string"))) {
            this.sendError("Malformed method invocation", msg);
            return;
        }

        var randomSeed = msg.randomSeed || null;

        // set up to mark the method as satisfied once all observers
        // (and subscriptions) have reacted to any writes that were
        // done.
        var fence = new DDPServer._WriteFence;
        fence.onAllCommitted(function () {
            // Retire the fence so that future writes are allowed.
            // This means that callbacks like timers are free to use
            // the fence, and if they fire before it's armed (for
            // example, because the method waits for them) their
            // writes will be included in the fence.
            fence.retire();
            this.send({
            msg: 'updated', methods: [msg.id]});
        });

        // find the handler
        var handler = this.server.method_handlers[msg.method];
        if (!handler) {
            this.send({
            msg: 'result', id: msg.id,
            error: new Meteor.Error(404, `Method '${msg.method}' not found`)});
            fence.arm();
            return;
        }

        var setUserId = function(userId) {
            this._setUserId(userId);
        };

        var invocation = new DDPCommon.MethodInvocation({
            isSimulation: false,
            userId: this.userId,
            setUserId: setUserId,
            unblock: unblock,
            connection: this.connectionHandle,
            randomSeed: randomSeed
        });

        const promise = new Promise((resolve, reject) => {
            // XXX It'd be better if we could hook into method handlers better but
            // for now, we need to check if the ddp-rate-limiter exists since we
            // have a weak requirement for the ddp-rate-limiter package to be added
            // to our application.
            if (Package['ddp-rate-limiter']) {
            var DDPRateLimiter = Package['ddp-rate-limiter'].DDPRateLimiter;
            var rateLimiterInput = {
                userId: this.userId,
                clientAddress: this.connectionHandle.clientAddress,
                type: "method",
                name: msg.method,
                connectionId: this.id
            };
            DDPRateLimiter._increment(rateLimiterInput);
            var rateLimitResult = DDPRateLimiter._check(rateLimiterInput)
            if (!rateLimitResult.allowed) {
                reject(new Meteor.Error(
                "too-many-requests",
                DDPRateLimiter.getErrorMessage(rateLimitResult),
                {timeToReset: rateLimitResult.timeToReset}
                ));
                return;
            }
            }

            resolve(DDPServer._CurrentWriteFence.withValue(
            fence,
            () => DDP._CurrentMethodInvocation.withValue(
                invocation,
                () => maybeAuditArgumentChecks(
                handler, invocation, msg.params,
                "call to '" + msg.method + "'"
                )
            )
            ));
        });

        function finish() {
            fence.arm();
            unblock();
        }

        const payload = {
            msg: "result",
            id: msg.id
        };

        promise.then((result) => {
            finish();
            if (result !== undefined) {
            payload.result = result;
            }
            this.send(payload);
        }, (exception) => {
            finish();
            payload.error = wrapInternalException(
            exception,
            `while invoking method '${msg.method}'`
            );
            this.send(payload);
        });
        }
    }  
  }

  static _eachSub(f) {
    this._namedSubs.forEach(f);
    this._universalSubs.forEach(f);
  }

  static _diffCollectionViews(beforeCVs) {
    DiffSequence.diffMaps(beforeCVs, this.collectionViews, {
      both(collectionName, leftValue, rightValue) {
        rightValue.diff(leftValue);
      },
      rightOnly(collectionName, rightValue) {
        rightValue.documents.forEach(function (docView, id) {
          this.sendAdded(collectionName, id, docView.getFields());
        });
      },
      leftOnly(collectionName, leftValue) {
        leftValue.documents.forEach(function (doc, id) {
          this.sendRemoved(collectionName, id);
        });
      }
    });
  }

  // Sets the current user id in all appropriate contexts and reruns
  // all subscriptions
  static _setUserId(userId) {
    if (userId !== null && typeof userId !== "string")
      throw new Error("setUserId must be called on string or null, not " +
                      typeof userId);

    // Prevent newly-created universal subscriptions from being added to our
    // session; they will be found below when we call startUniversalSubs.
    //
    // (We don't have to worry about named subscriptions, because we only add
    // them when we process a 'sub' message. We are currently processing a
    // 'method' message, and the method did not unblock, because it is illegal
    // to call setUserId after unblock. Thus we cannot be concurrently adding a
    // new named subscription.)
    this._dontStartNewUniversalSubs = true;

    // Prevent current subs from updating our collectionViews and call their
    // stop callbacks. This may yield.
    this._eachSub(function (sub) {
      sub._deactivate();
    });

    // All subs should now be deactivated. Stop sending messages to the client,
    // save the state of the published collections, reset to an empty view, and
    // update the userId.
    this._isSending = false;
    var beforeCVs = this.collectionViews;
    this.collectionViews = new Map();
    this.userId = userId;

    // _setUserId is normally called from a Meteor method with
    // DDP._CurrentMethodInvocation set. But DDP._CurrentMethodInvocation is not
    // expected to be set inside a publish function, so we temporary unset it.
    // Inside a publish function DDP._CurrentPublicationInvocation is set.
    DDP._CurrentMethodInvocation.withValue(undefined, function () {
      // Save the old named subs, and reset to having no subscriptions.
      this._namedSubs = new Map();
      this._universalSubs = [];

      this._namedSubs.forEach(function (sub, subscriptionId) {
        var newSub = sub._recreate();
        this._namedSubs.set(subscriptionId, newSub);
        // nb: if the handler throws or calls this.error(), it will in fact
        // immediately send its 'nosub'. This is OK, though.
        newSub._runHandler();
      });

      // Allow newly-created universal subs to be started on our connection in
      // parallel with the ones we're spinning up here, and spin up universal
      // subs.
      this._dontStartNewUniversalSubs = false;
      this.startUniversalSubs();
    });

    // Start sending messages again, beginning with the diff from the previous
    // state of the world to the current state. No yields are allowed during
    // this diff, so that other changes cannot interleave.
    Meteor._noYieldsAllowed(function () {
      this._isSending = true;
      this._diffCollectionViews(beforeCVs);
      if (!_.isEmpty(this._pendingReady)) {
        this.sendReady(this._pendingReady);
        this._pendingReady = [];
      }
    });
  }

  static _startSubscription(handler, subId, params, name) {
    const sub = new Subscription(
      this, handler, subId, params, name);

    subId ?
      this._namedSubs.set(subId, sub)
    :
      this._universalSubs = [...this._universalSubs, sub];

    sub._runHandler();
  }

  // tear down specified subscription
  static _stopSubscription(subId, error) {
    let subName = null;
    if (subId) {
      const maybeSub = this._namedSubs.subId;
      if (maybeSub) {
        subName = maybeSub._name;
        maybeSub._removeAllDocuments();
        maybeSub._deactivate();
        this._namedSubs.delete(subId);
      }
    }

    let response = {msg: 'nosub', id: subId};

    if (error) {
      response.error = wrapInternalException(
        error,
        subName ? ("from sub " + subName + " id " + subId)
          : ("from sub id " + subId));
    }

    this.send(response);
  }

  // tear down all subscriptions. Note that this does NOT send removed or nosub
  // messages, since we assume the client is gone.
   static _deactivateAllSubscriptions() {
    this._namedSubs.forEach(function (sub, id) {
      sub._deactivate();
    });

    this._namedSubs = new Map();

    this._universalSubs.forEach(function (sub) {
      sub._deactivate();
    });

    this._universalSubs = [];
  }

  // Determine the remote client's IP address, based on the
  // HTTP_FORWARDED_COUNT environment variable representing how many
  // proxies the server is behind.
  static  _clientAddress() {
    // For the reported client address for a connection to be correct,
    // the developer must set the HTTP_FORWARDED_COUNT environment
    // variable to an integer representing the number of hops they
    // expect in the `x-forwarded-for` header. E.g., set to "1" if the
    // server is behind one proxy.
    //
    // This could be computed once at startup instead of every time.
    let httpForwardedCount = parseInt(process.env['HTTP_FORWARDED_COUNT']) || 0;

    if (httpForwardedCount === 0)
      return this.socket.remoteAddress;

    let forwardedFor = this.socket.headers["x-forwarded-for"];
    if (! _.isString(forwardedFor))
      return null;
    forwardedFor = forwardedFor.trim().split(/\s*,\s*/);

    // Typically the first value in the `x-forwarded-for` header is
    // the original IP address of the client connecting to the first
    // proxy.  However, the end user can easily spoof the header, in
    // which case the first value(s) will be the fake IP address from
    // the user pretending to be a proxy reporting the original IP
    // address value.  By counting HTTP_FORWARDED_COUNT back from the
    // end of the list, we ensure that we get the IP address being
    // reported by *our* first proxy.

    if (httpForwardedCount < 0 || httpForwardedCount > forwardedFor.length)
      return null;

    return forwardedFor[forwardedFor.length - httpForwardedCount];
  }

}