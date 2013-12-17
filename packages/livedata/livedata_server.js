DDPServer = {};

var Fiber = Npm.require('fibers');

// This file contains classes:
// * Session - The server's connection to a single DDP client
// * Subscription - A single subscription for a single client
// * Server - An entire server that may talk to > 1 client. A DDP endpoint.
//
// Session and Subscription are file scope. For now, until we freeze
// the interface, Server is package scope (in the future it should be
// exported.)

// Represents a single document in a SessionCollectionView
var SessionDocumentView = function () {
  var self = this;
  self.existsIn = {}; // set of subscriptionHandle
  self.dataByKey = {}; // key-> [ {subscriptionHandle, value} by precedence]
};

_.extend(SessionDocumentView.prototype, {

  getFields: function () {
    var self = this;
    var ret = {};
    _.each(self.dataByKey, function (precedenceList, key) {
      ret[key] = precedenceList[0].value;
    });
    return ret;
  },

  clearField: function (subscriptionHandle, key, changeCollector) {
    var self = this;
    // Publish API ignores _id if present in fields
    if (key === "_id")
      return;
    var precedenceList = self.dataByKey[key];

    // It's okay to clear fields that didn't exist. No need to throw
    // an error.
    if (!precedenceList)
      return;

    var removedValue = undefined;
    for (var i = 0; i < precedenceList.length; i++) {
      var precedence = precedenceList[i];
      if (precedence.subscriptionHandle === subscriptionHandle) {
        // The view's value can only change if this subscription is the one that
        // used to have precedence.
        if (i === 0)
          removedValue = precedence.value;
        precedenceList.splice(i, 1);
        break;
      }
    }
    if (_.isEmpty(precedenceList)) {
      delete self.dataByKey[key];
      changeCollector[key] = undefined;
    } else if (removedValue !== undefined &&
               !EJSON.equals(removedValue, precedenceList[0].value)) {
      changeCollector[key] = precedenceList[0].value;
    }
  },

  changeField: function (subscriptionHandle, key, value,
                         changeCollector, isAdd) {
    var self = this;
    // Publish API ignores _id if present in fields
    if (key === "_id")
      return;
    if (!_.has(self.dataByKey, key)) {
      self.dataByKey[key] = [{subscriptionHandle: subscriptionHandle,
                              value: value}];
      changeCollector[key] = value;
      return;
    }
    var precedenceList = self.dataByKey[key];
    var elt;
    if (!isAdd) {
      elt = _.find(precedenceList, function (precedence) {
        return precedence.subscriptionHandle === subscriptionHandle;
      });
    }

    if (elt) {
      if (elt === precedenceList[0] && !EJSON.equals(value, elt.value)) {
        // this subscription is changing the value of this field.
        changeCollector[key] = value;
      }
      elt.value = value;
    } else {
      // this subscription is newly caring about this field
      precedenceList.push({subscriptionHandle: subscriptionHandle, value: value});
    }

  }
});

// Represents a client's view of a single collection
var SessionCollectionView = function (collectionName, sessionCallbacks) {
  var self = this;
  self.collectionName = collectionName;
  self.documents = {};
  self.callbacks = sessionCallbacks;
};

LivedataTest.SessionCollectionView = SessionCollectionView;


_.extend(SessionCollectionView.prototype, {

  isEmpty: function () {
    var self = this;
    return _.isEmpty(self.documents);
  },

  diff: function (previous) {
    var self = this;
    LocalCollection._diffObjects(previous.documents, self.documents, {
      both: _.bind(self.diffDocument, self),

      rightOnly: function (id, nowDV) {
        self.callbacks.added(self.collectionName, id, nowDV.getFields());
      },

      leftOnly: function (id, prevDV) {
        self.callbacks.removed(self.collectionName, id);
      }
    });
  },

  diffDocument: function (id, prevDV, nowDV) {
    var self = this;
    var fields = {};
    LocalCollection._diffObjects(prevDV.getFields(), nowDV.getFields(), {
      both: function (key, prev, now) {
        if (!EJSON.equals(prev, now))
          fields[key] = now;
      },
      rightOnly: function (key, now) {
        fields[key] = now;
      },
      leftOnly: function(key, prev) {
        fields[key] = undefined;
      }
    });
    self.callbacks.changed(self.collectionName, id, fields);
  },

  added: function (subscriptionHandle, id, fields) {
    var self = this;
    var docView = self.documents[id];
    var added = false;
    if (!docView) {
      added = true;
      docView = new SessionDocumentView();
      self.documents[id] = docView;
    }
    docView.existsIn[subscriptionHandle] = true;
    var changeCollector = {};
    _.each(fields, function (value, key) {
      docView.changeField(
        subscriptionHandle, key, value, changeCollector, true);
    });
    if (added)
      self.callbacks.added(self.collectionName, id, changeCollector);
    else
      self.callbacks.changed(self.collectionName, id, changeCollector);
  },

  changed: function (subscriptionHandle, id, changed) {
    var self = this;
    var changedResult = {};
    var docView = self.documents[id];
    if (!docView)
      throw new Error("Could not find element with id " + id + " to change");
    _.each(changed, function (value, key) {
      if (value === undefined)
        docView.clearField(subscriptionHandle, key, changedResult);
      else
        docView.changeField(subscriptionHandle, key, value, changedResult);
    });
    self.callbacks.changed(self.collectionName, id, changedResult);
  },

  removed: function (subscriptionHandle, id) {
    var self = this;
    var docView = self.documents[id];
    if (!docView) {
      var err = new Error("Removed nonexistent document " + id);
      throw err;
    }
    delete docView.existsIn[subscriptionHandle];
    if (_.isEmpty(docView.existsIn)) {
      // it is gone from everyone
      self.callbacks.removed(self.collectionName, id);
      delete self.documents[id];
    } else {
      var changed = {};
      // remove this subscription from every precedence list
      // and record the changes
      _.each(docView.dataByKey, function (precedenceList, key) {
        docView.clearField(subscriptionHandle, key, changed);
      });

      self.callbacks.changed(self.collectionName, id, changed);
    }
  }
});

/******************************************************************************/
/* Session                                                                    */
/******************************************************************************/

var Session = function (server, version, socket) {
  var self = this;
  self.id = Random.id();

  self.server = server;
  self.version = version;

  self.initialized = false;
  self.socket = socket;

  // set to null when the session is destroyed. multiple places below
  // use this to determine if the session is alive or not.
  self.inQueue = [];

  self.blocked = false;
  self.workerRunning = false;

  // Sub objects for active subscriptions
  self._namedSubs = {};
  self._universalSubs = [];

  self.userId = null;

  self.collectionViews = {};

  // Set this to false to not send messages when collectionViews are
  // modified. This is done when rerunning subs in _setUserId and those messages
  // are calculated via a diff instead.
  self._isSending = true;

  // If this is true, don't start a newly-created universal publisher on this
  // session. The session will take care of starting it when appropriate.
  self._dontStartNewUniversalSubs = false;

  // when we are rerunning subscriptions, any ready messages
  // we want to buffer up for when we are done rerunning subscriptions
  self._pendingReady = [];

  // List of callbacks to call when this connection is closed.
  self._closeCallbacks = [];

  // The `ConnectionHandle` for this session, passed to
  // `Meteor.server.onConnection` callbacks.
  self.connectionHandle = {
    id: self.id,
    close: function () {
      self.server._closeSession(self);
    },
    onClose: function (fn) {
      var cb = Meteor.bindEnvironment(fn, "connection onClose callback");
      if (self.inQueue) {
        self._closeCallbacks.push(cb);
      } else {
        // if we're already closed, call the callback.
        Meteor.defer(cb);
      }
    }
  };

  socket.send(stringifyDDP({msg: 'connected',
                            session: self.id}));
  // On initial connect, spin up all the universal publishers.
  Fiber(function () {
    self.startUniversalSubs();
  }).run();

  Package.facts && Package.facts.Facts.incrementServerFact(
    "livedata", "sessions", 1);
};

_.extend(Session.prototype, {


  sendReady: function (subscriptionIds) {
    var self = this;
    if (self._isSending)
      self.send({msg: "ready", subs: subscriptionIds});
    else {
      _.each(subscriptionIds, function (subscriptionId) {
        self._pendingReady.push(subscriptionId);
      });
    }
  },

  sendAdded: function (collectionName, id, fields) {
    var self = this;
    if (self._isSending)
      self.send({msg: "added", collection: collectionName, id: id, fields: fields});
  },

  sendChanged: function (collectionName, id, fields) {
    var self = this;
    if (_.isEmpty(fields))
      return;

    if (self._isSending) {
      self.send({
        msg: "changed",
        collection: collectionName,
        id: id,
        fields: fields
      });
    }
  },

  sendRemoved: function (collectionName, id) {
    var self = this;
    if (self._isSending)
      self.send({msg: "removed", collection: collectionName, id: id});
  },

  getSendCallbacks: function () {
    var self = this;
    return {
      added: _.bind(self.sendAdded, self),
      changed: _.bind(self.sendChanged, self),
      removed: _.bind(self.sendRemoved, self)
    };
  },

  getCollectionView: function (collectionName) {
    var self = this;
    if (_.has(self.collectionViews, collectionName)) {
      return self.collectionViews[collectionName];
    }
    var ret = new SessionCollectionView(collectionName,
                                        self.getSendCallbacks());
    self.collectionViews[collectionName] = ret;
    return ret;
  },

  added: function (subscriptionHandle, collectionName, id, fields) {
    var self = this;
    var view = self.getCollectionView(collectionName);
    view.added(subscriptionHandle, id, fields);
  },

  removed: function (subscriptionHandle, collectionName, id) {
    var self = this;
    var view = self.getCollectionView(collectionName);
    view.removed(subscriptionHandle, id);
    if (view.isEmpty()) {
      delete self.collectionViews[collectionName];
    }
  },

  changed: function (subscriptionHandle, collectionName, id, fields) {
    var self = this;
    var view = self.getCollectionView(collectionName);
    view.changed(subscriptionHandle, id, fields);
  },

  startUniversalSubs: function () {
    var self = this;
    // Make a shallow copy of the set of universal handlers and start them. If
    // additional universal publishers start while we're running them (due to
    // yielding), they will run separately as part of Server.publish.
    var handlers = _.clone(self.server.universal_publish_handlers);
    _.each(handlers, function (handler) {
      self._startSubscription(handler);
    });
  },

  // Destroy this session. Stop all processing and tear everything
  // down. If a socket was attached, close it.
  destroy: function () {
    var self = this;

    if (self.socket) {
      self.socket.close();
      self.socket._meteorSession = null;
    }

    // Drop the merge box data immediately.
    self.collectionViews = {};
    self.inQueue = null;

    Package.facts && Package.facts.Facts.incrementServerFact(
      "livedata", "sessions", -1);

    Meteor.defer(function () {
      // stop callbacks can yield, so we defer this on destroy.
      // sub._isDeactivated() detects that we set inQueue to null and
      // treats it as semi-deactivated (it will ignore incoming callbacks, etc).
      self._deactivateAllSubscriptions();

      // Defer calling the close callbacks, so that the caller closing
      // the session isn't waiting for all the callbacks to complete.
      _.each(self._closeCallbacks, function (callback) {
        callback();
      });
    });
  },

  // Send a message (doing nothing if no socket is connected right now.)
  // It should be a JSON object (it will be stringified.)
  send: function (msg) {
    var self = this;
    if (self.socket) {
      if (Meteor._printSentDDP)
        Meteor._debug("Sent DDP", stringifyDDP(msg));
      self.socket.send(stringifyDDP(msg));
    }
  },

  // Send a connection error.
  sendError: function (reason, offendingMessage) {
    var self = this;
    var msg = {msg: 'error', reason: reason};
    if (offendingMessage)
      msg.offendingMessage = offendingMessage;
    self.send(msg);
  },

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
  processMessage: function (msg_in) {
    var self = this;
    if (!self.inQueue) // we have been destroyed.
      return;

    self.inQueue.push(msg_in);
    if (self.workerRunning)
      return;
    self.workerRunning = true;

    var processNext = function () {
      var msg = self.inQueue && self.inQueue.shift();
      if (!msg) {
        self.workerRunning = false;
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

        if (_.has(self.protocol_handlers, msg.msg))
          self.protocol_handlers[msg.msg].call(self, msg, unblock);
        else
          self.sendError('Bad request', msg);
        unblock(); // in case the handler didn't already do it
      }).run();
    };

    processNext();
  },

  protocol_handlers: {
    sub: function (msg) {
      var self = this;

      // reject malformed messages
      if (typeof (msg.id) !== "string" ||
          typeof (msg.name) !== "string" ||
          (('params' in msg) && !(msg.params instanceof Array))) {
        self.sendError("Malformed subscription", msg);
        return;
      }

      if (!self.server.publish_handlers[msg.name]) {
        self.send({
          msg: 'nosub', id: msg.id,
          error: new Meteor.Error(404, "Subscription not found")});
        return;
      }

      if (_.has(self._namedSubs, msg.id))
        // subs are idempotent, or rather, they are ignored if a sub
        // with that id already exists. this is important during
        // reconnect.
        return;

      var handler = self.server.publish_handlers[msg.name];
      self._startSubscription(handler, msg.id, msg.params, msg.name);

    },

    unsub: function (msg) {
      var self = this;

      self._stopSubscription(msg.id);
    },

    method: function (msg, unblock) {
      var self = this;

      // reject malformed messages
      // XXX should also reject messages with unknown attributes?
      if (typeof (msg.id) !== "string" ||
          typeof (msg.method) !== "string" ||
          (('params' in msg) && !(msg.params instanceof Array))) {
        self.sendError("Malformed method invocation", msg);
        return;
      }

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
        self.send({
          msg: 'updated', methods: [msg.id]});
      });

      // find the handler
      var handler = self.server.method_handlers[msg.method];
      if (!handler) {
        self.send({
          msg: 'result', id: msg.id,
          error: new Meteor.Error(404, "Method not found")});
        fence.arm();
        return;
      }

      var setUserId = function(userId) {
        self._setUserId(userId);
      };

      var invocation = new MethodInvocation({
        isSimulation: false,
        userId: self.userId,
        setUserId: setUserId,
        unblock: unblock,
        connection: self.connectionHandle
      });
      try {
        var result = DDPServer._CurrentWriteFence.withValue(fence, function () {
          return DDP._CurrentInvocation.withValue(invocation, function () {
            return maybeAuditArgumentChecks(
              handler, invocation, msg.params, "call to '" + msg.method + "'");
          });
        });
      } catch (e) {
        var exception = e;
      }

      fence.arm(); // we're done adding writes to the fence
      unblock(); // unblock, if the method hasn't done it already

      exception = wrapInternalException(
        exception, "while invoking method '" + msg.method + "'");

      // send response and add to cache
      var payload =
        exception ? {error: exception} : (result !== undefined ?
                                          {result: result} : {});
      self.send(_.extend({msg: 'result', id: msg.id}, payload));
    }
  },

  _eachSub: function (f) {
    var self = this;
    _.each(self._namedSubs, f);
    _.each(self._universalSubs, f);
  },

  _diffCollectionViews: function (beforeCVs) {
    var self = this;
    LocalCollection._diffObjects(beforeCVs, self.collectionViews, {
      both: function (collectionName, leftValue, rightValue) {
        rightValue.diff(leftValue);
      },
      rightOnly: function (collectionName, rightValue) {
        _.each(rightValue.documents, function (docView, id) {
          self.sendAdded(collectionName, id, docView.getFields());
        });
      },
      leftOnly: function (collectionName, leftValue) {
        _.each(leftValue.documents, function (doc, id) {
          self.sendRemoved(collectionName, id);
        });
      }
    });
  },

  // Sets the current user id in all appropriate contexts and reruns
  // all subscriptions
  _setUserId: function(userId) {
    var self = this;

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
    self._dontStartNewUniversalSubs = true;

    // Prevent current subs from updating our collectionViews and call their
    // stop callbacks. This may yield.
    self._eachSub(function (sub) {
      sub._deactivate();
    });

    // All subs should now be deactivated. Stop sending messages to the client,
    // save the state of the published collections, reset to an empty view, and
    // update the userId.
    self._isSending = false;
    var beforeCVs = self.collectionViews;
    self.collectionViews = {};
    self.userId = userId;

    // Save the old named subs, and reset to having no subscriptions.
    var oldNamedSubs = self._namedSubs;
    self._namedSubs = {};
    self._universalSubs = [];

    _.each(oldNamedSubs, function (sub, subscriptionId) {
      self._namedSubs[subscriptionId] = sub._recreate();
      // nb: if the handler throws or calls this.error(), it will in fact
      // immediately send its 'nosub'. This is OK, though.
      self._namedSubs[subscriptionId]._runHandler();
    });

    // Allow newly-created universal subs to be started on our connection in
    // parallel with the ones we're spinning up here, and spin up universal
    // subs.
    self._dontStartNewUniversalSubs = false;
    self.startUniversalSubs();

    // Start sending messages again, beginning with the diff from the previous
    // state of the world to the current state. No yields are allowed during
    // this diff, so that other changes cannot interleave.
    Meteor._noYieldsAllowed(function () {
      self._isSending = true;
      self._diffCollectionViews(beforeCVs);
      if (!_.isEmpty(self._pendingReady)) {
        self.sendReady(self._pendingReady);
        self._pendingReady = [];
      }
    });
  },

  _startSubscription: function (handler, subId, params, name) {
    var self = this;

    var sub = new Subscription(
      self, handler, subId, params, name);
    if (subId)
      self._namedSubs[subId] = sub;
    else
      self._universalSubs.push(sub);

    sub._runHandler();
  },

  // tear down specified subscription
  _stopSubscription: function (subId, error) {
    var self = this;

    if (subId && self._namedSubs[subId]) {
      self._namedSubs[subId]._removeAllDocuments();
      self._namedSubs[subId]._deactivate();
      delete self._namedSubs[subId];
    }

    var response = {msg: 'nosub', id: subId};

    if (error)
      response.error = wrapInternalException(error, "from sub " + subId);

    self.send(response);
  },

  // tear down all subscriptions. Note that this does NOT send removed or nosub
  // messages, since we assume the client is gone.
  _deactivateAllSubscriptions: function () {
    var self = this;

    _.each(self._namedSubs, function (sub, id) {
      sub._deactivate();
    });
    self._namedSubs = {};

    _.each(self._universalSubs, function (sub) {
      sub._deactivate();
    });
    self._universalSubs = [];
  }

});

/******************************************************************************/
/* Subscription                                                               */
/******************************************************************************/

// ctor for a sub handle: the input to each publish function
var Subscription = function (
    session, handler, subscriptionId, params, name) {
  var self = this;
  self._session = session; // type is Session
  self.connection = session.connectionHandle; // public API object

  self._handler = handler;

  // my subscription ID (generated by client, undefined for universal subs).
  self._subscriptionId = subscriptionId;
  // undefined for universal subs
  self._name = name;

  self._params = params || [];

  // Only named subscriptions have IDs, but we need some sort of string
  // internally to keep track of all subscriptions inside
  // SessionDocumentViews. We use this subscriptionHandle for that.
  if (self._subscriptionId) {
    self._subscriptionHandle = 'N' + self._subscriptionId;
  } else {
    self._subscriptionHandle = 'U' + Random.id();
  }

  // has _deactivate been called?
  self._deactivated = false;

  // stop callbacks to g/c this sub.  called w/ zero arguments.
  self._stopCallbacks = [];

  // the set of (collection, documentid) that this subscription has
  // an opinion about
  self._documents = {};

  // remember if we are ready.
  self._ready = false;

  // Part of the public API: the user of this sub.
  self.userId = session.userId;

  // For now, the id filter is going to default to
  // the to/from DDP methods on LocalCollection, to
  // specifically deal with mongo/minimongo ObjectIds.

  // Later, you will be able to make this be "raw"
  // if you want to publish a collection that you know
  // just has strings for keys and no funny business, to
  // a ddp consumer that isn't minimongo

  self._idFilter = {
    idStringify: LocalCollection._idStringify,
    idParse: LocalCollection._idParse
  };

  Package.facts && Package.facts.Facts.incrementServerFact(
    "livedata", "subscriptions", 1);
};

_.extend(Subscription.prototype, {
  _runHandler: function () {
    var self = this;
    try {
      var res = maybeAuditArgumentChecks(
        self._handler, self, EJSON.clone(self._params),
        "publisher '" + self._name + "'");
    } catch (e) {
      self.error(e);
      return;
    }

    // Did the handler call this.error or this.stop?
    if (self._isDeactivated())
      return;

    // SPECIAL CASE: Instead of writing their own callbacks that invoke
    // this.added/changed/ready/etc, the user can just return a collection
    // cursor or array of cursors from the publish function; we call their
    // _publishCursor method which starts observing the cursor and publishes the
    // results. Note that _publishCursor does NOT call ready().
    //
    // XXX This uses an undocumented interface which only the Mongo cursor
    // interface publishes. Should we make this interface public and encourage
    // users to implement it themselves? Arguably, it's unnecessary; users can
    // already write their own functions like
    //   var publishMyReactiveThingy = function (name, handler) {
    //     Meteor.publish(name, function () {
    //       var reactiveThingy = handler();
    //       reactiveThingy.publishMe();
    //     });
    //   };
    var isCursor = function (c) {
      return c && c._publishCursor;
    };
    if (isCursor(res)) {
      res._publishCursor(self);
      // _publishCursor only returns after the initial added callbacks have run.
      // mark subscription as ready.
      self.ready();
    } else if (_.isArray(res)) {
      // check all the elements are cursors
      if (! _.all(res, isCursor)) {
        self.error(new Error("Publish function returned an array of non-Cursors"));
        return;
      }
      // find duplicate collection names
      // XXX we should support overlapping cursors, but that would require the
      // merge box to allow overlap within a subscription
      var collectionNames = {};
      for (var i = 0; i < res.length; ++i) {
        var collectionName = res[i]._getCollectionName();
        if (_.has(collectionNames, collectionName)) {
          self.error(new Error(
            "Publish function returned multiple cursors for collection " +
              collectionName));
          return;
        }
        collectionNames[collectionName] = true;
      };

      _.each(res, function (cur) {
        cur._publishCursor(self);
      });
      self.ready();
    } else if (res) {
      // truthy values other than cursors or arrays are probably a
      // user mistake (possible returning a Mongo document via, say,
      // `coll.findOne()`).
      self.error(new Error("Publish function can only return a Cursor or "
                           + "an array of Cursors"));
    }
  },

  // This calls all stop callbacks and prevents the handler from updating any
  // SessionCollectionViews further. It's used when the user unsubscribes or
  // disconnects, as well as during setUserId re-runs. It does *NOT* send
  // removed messages for the published objects; if that is necessary, call
  // _removeAllDocuments first.
  _deactivate: function() {
    var self = this;
    if (self._deactivated)
      return;
    self._deactivated = true;
    self._callStopCallbacks();
    Package.facts && Package.facts.Facts.incrementServerFact(
      "livedata", "subscriptions", -1);
  },

  _callStopCallbacks: function () {
    var self = this;
    // tell listeners, so they can clean up
    var callbacks = self._stopCallbacks;
    self._stopCallbacks = [];
    _.each(callbacks, function (callback) {
      callback();
    });
  },

  // Send remove messages for every document.
  _removeAllDocuments: function () {
    var self = this;
    Meteor._noYieldsAllowed(function () {
      _.each(self._documents, function(collectionDocs, collectionName) {
        // Iterate over _.keys instead of the dictionary itself, since we'll be
        // mutating it.
        _.each(_.keys(collectionDocs), function (strId) {
          self.removed(collectionName, self._idFilter.idParse(strId));
        });
      });
    });
  },

  // Returns a new Subscription for the same session with the same
  // initial creation parameters. This isn't a clone: it doesn't have
  // the same _documents cache, stopped state or callbacks; may have a
  // different _subscriptionHandle, and gets its userId from the
  // session, not from this object.
  _recreate: function () {
    var self = this;
    return new Subscription(
      self._session, self._handler, self._subscriptionId, self._params);
  },

  error: function (error) {
    var self = this;
    if (self._isDeactivated())
      return;
    self._session._stopSubscription(self._subscriptionId, error);
  },

  // Note that while our DDP client will notice that you've called stop() on the
  // server (and clean up its _subscriptions table) we don't actually provide a
  // mechanism for an app to notice this (the subscribe onError callback only
  // triggers if there is an error).
  stop: function () {
    var self = this;
    if (self._isDeactivated())
      return;
    self._session._stopSubscription(self._subscriptionId);
  },

  onStop: function (callback) {
    var self = this;
    if (self._isDeactivated())
      callback();
    else
      self._stopCallbacks.push(callback);
  },

  // This returns true if the sub has been deactivated, *OR* if the session was
  // destroyed but the deferred call to _deactivateAllSubscriptions hasn't
  // happened yet.
  _isDeactivated: function () {
    var self = this;
    return self._deactivated || self._session.inQueue === null;
  },

  added: function (collectionName, id, fields) {
    var self = this;
    if (self._isDeactivated())
      return;
    id = self._idFilter.idStringify(id);
    Meteor._ensure(self._documents, collectionName)[id] = true;
    self._session.added(self._subscriptionHandle, collectionName, id, fields);
  },

  changed: function (collectionName, id, fields) {
    var self = this;
    if (self._isDeactivated())
      return;
    id = self._idFilter.idStringify(id);
    self._session.changed(self._subscriptionHandle, collectionName, id, fields);
  },

  removed: function (collectionName, id) {
    var self = this;
    if (self._isDeactivated())
      return;
    id = self._idFilter.idStringify(id);
    // We don't bother to delete sets of things in a collection if the
    // collection is empty.  It could break _removeAllDocuments.
    delete self._documents[collectionName][id];
    self._session.removed(self._subscriptionHandle, collectionName, id);
  },

  ready: function () {
    var self = this;
    if (self._isDeactivated())
      return;
    if (!self._subscriptionId)
      return;  // unnecessary but ignored for universal sub
    if (!self._ready) {
      self._session.sendReady([self._subscriptionId]);
      self._ready = true;
    }
  }
});

/******************************************************************************/
/* Server                                                                     */
/******************************************************************************/

Server = function () {
  var self = this;

  // Map of callbacks to call when a new connection comes in to the
  // server and completes DDP version negotiation. Use an object instead
  // of an array so we can safely remove one from the list while
  // iterating over it.
  self.connectionCallbacks = {};
  self.nextConnectionCallbackId = 0;

  self.publish_handlers = {};
  self.universal_publish_handlers = [];

  self.method_handlers = {};

  self.sessions = {}; // map from id to session

  self.stream_server = new StreamServer;

  self.stream_server.register(function (socket) {
    // socket implements the SockJSConnection interface
    socket._meteorSession = null;

    var sendError = function (reason, offendingMessage) {
      var msg = {msg: 'error', reason: reason};
      if (offendingMessage)
        msg.offendingMessage = offendingMessage;
      socket.send(stringifyDDP(msg));
    };

    socket.on('data', function (raw_msg) {
      if (Meteor._printReceivedDDP) {
        Meteor._debug("Received DDP", raw_msg);
      }
      try {
        try {
          var msg = parseDDP(raw_msg);
        } catch (err) {
          sendError('Parse error');
          return;
        }
        if (msg === null || !msg.msg) {
          sendError('Bad request', msg);
          return;
        }

        if (msg.msg === 'connect') {
          if (socket._meteorSession) {
            sendError("Already connected", msg);
            return;
          }
          self._handleConnect(socket, msg);
          return;
        }

        if (!socket._meteorSession) {
          sendError('Must connect first', msg);
          return;
        }
        socket._meteorSession.processMessage(msg);
      } catch (e) {
        // XXX print stack nicely
        Meteor._debug("Internal exception while processing message", msg,
                      e.message, e.stack);
      }
    });

    socket.on('close', function () {
      if (socket._meteorSession) {
        Fiber(function () {
          self._closeSession(socket._meteorSession);
        }).run();
      }
    });
  });
};

_.extend(Server.prototype, {

  onConnection: function (fn) {
    var self = this;

    fn = Meteor.bindEnvironment(fn, "onConnection callback");

    var id = self.nextConnectionCallbackId++;
    self.connectionCallbacks[id] = fn;

    return {
      stop: function () {
        delete self.connectionCallbacks[id];
      }
    };
  },

  _handleConnect: function (socket, msg) {
    var self = this;
    // In the future, handle session resumption: something like:
    //  socket._meteorSession = self.sessions[msg.session]
    var version = calculateVersion(msg.support, SUPPORTED_DDP_VERSIONS);

    if (msg.version === version) {
      // Creating a new session
      socket._meteorSession = new Session(self, version, socket);
      self.sessions[socket._meteorSession.id] = socket._meteorSession;
      _.each(_.keys(self.connectionCallbacks), function (id) {
        if (_.has(self.connectionCallbacks, id) && socket._meteorSession) {
          var callback = self.connectionCallbacks[id];
          callback(socket._meteorSession.connectionHandle);
        }
      });
    } else if (!msg.version) {
      // connect message without a version. This means an old (pre-pre1)
      // client is trying to connect. If we just disconnect the
      // connection, they'll retry right away. Instead, just pause for a
      // bit (randomly distributed so as to avoid synchronized swarms)
      // and hold the connection open.
      var timeout = 1000 * (30 + Random.fraction() * 60);
      // drop all future data coming over this connection on the
      // floor. We don't want to confuse things.
      socket.removeAllListeners('data');
      setTimeout(function () {
        socket.send(stringifyDDP({msg: 'failed', version: version}));
        socket.close();
      }, timeout);
    } else {
      socket.send(stringifyDDP({msg: 'failed', version: version}));
      socket.close();
    }
  },
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
  publish: function (name, handler, options) {
    var self = this;

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
  },

  _closeSession: function (session) {
    var self = this;
    if (self.sessions[session.id]) {
      delete self.sessions[session.id];
      session.destroy();
    }
  },

  methods: function (methods) {
    var self = this;
    _.each(methods, function (func, name) {
      if (self.method_handlers[name])
        throw new Error("A method named '" + name + "' is already defined");
      self.method_handlers[name] = func;
    });
  },

  call: function (name /*, arguments */) {
    // if it's a function, the last argument is the result callback,
    // not a parameter to the remote method.
    var args = Array.prototype.slice.call(arguments, 1);
    if (args.length && typeof args[args.length - 1] === "function")
      var callback = args.pop();
    return this.apply(name, args, callback);
  },

  // @param options {Optional Object}
  // @param callback {Optional Function}
  apply: function (name, args, options, callback) {
    var self = this;

    // We were passed 3 arguments. They may be either (name, args, options)
    // or (name, args, callback)
    if (!callback && typeof options === 'function') {
      callback = options;
      options = {};
    }
    options = options || {};

    if (callback)
      // It's not really necessary to do this, since we immediately
      // run the callback in this fiber before returning, but we do it
      // anyway for regularity.
      // XXX improve error message (and how we report it)
      callback = Meteor.bindEnvironment(
        callback,
        "delivering result of invoking '" + name + "'"
      );

    // Run the handler
    var handler = self.method_handlers[name];
    var exception;
    if (!handler) {
      exception = new Meteor.Error(404, "Method not found");
    } else {
      // If this is a method call from within another method, get the
      // user state from the outer method, otherwise don't allow
      // setUserId to be called
      var userId = null;
      var setUserId = function() {
        throw new Error("Can't call setUserId on a server initiated method call");
      };
      var connection = null;
      var currentInvocation = DDP._CurrentInvocation.get();
      if (currentInvocation) {
        userId = currentInvocation.userId;
        setUserId = function(userId) {
          currentInvocation.setUserId(userId);
        };
        connection = currentInvocation.connection;
      }

      var invocation = new MethodInvocation({
        isSimulation: false,
        userId: userId,
        setUserId: setUserId,
        connection: connection
      });
      try {
        var result = DDP._CurrentInvocation.withValue(invocation, function () {
          return maybeAuditArgumentChecks(
            handler, invocation, args, "internal call to '" + name + "'");
        });
      } catch (e) {
        exception = e;
      }
    }

    // Return the result in whichever way the caller asked for it. Note that we
    // do NOT block on the write fence in an analogous way to how the client
    // blocks on the relevant data being visible, so you are NOT guaranteed that
    // cursor observe callbacks have fired when your callback is invoked. (We
    // can change this if there's a real use case.)
    if (callback) {
      callback(exception, result);
      return undefined;
    }
    if (exception)
      throw exception;
    return result;
  }
});

var calculateVersion = function (clientSupportedVersions,
                                 serverSupportedVersions) {
  var correctVersion = _.find(clientSupportedVersions, function (version) {
    return _.contains(serverSupportedVersions, version);
  });
  if (!correctVersion) {
    correctVersion = serverSupportedVersions[0];
  }
  return correctVersion;
};

LivedataTest.calculateVersion = calculateVersion;


// "blind" exceptions other than those that were deliberately thrown to signal
// errors to the client
var wrapInternalException = function (exception, context) {
  if (!exception || exception instanceof Meteor.Error)
    return exception;

  // Did the error contain more details that could have been useful if caught in
  // server code (or if thrown from non-client-originated code), but also
  // provided a "sanitized" version with more context than 500 Internal server
  // error? Use that.
  if (exception.sanitizedError) {
    if (exception.sanitizedError instanceof Meteor.Error)
      return exception.sanitizedError;
    Meteor._debug("Exception " + context + " provides a sanitizedError that " +
                  "is not a Meteor.Error; ignoring");
  }

  // tests can set the 'expected' flag on an exception so it won't go to the
  // server log
  if (!exception.expected)
    Meteor._debug("Exception " + context, exception.stack);

  return new Meteor.Error(500, "Internal server error");
};


// Audit argument checks, if the audit-argument-checks package exists (it is a
// weak dependency of this package).
var maybeAuditArgumentChecks = function (f, context, args, description) {
  args = args || [];
  if (Package['audit-argument-checks']) {
    return Match._failIfArgumentsAreNotAllChecked(
      f, context, args, description);
  }
  return f.apply(context, args);
};
