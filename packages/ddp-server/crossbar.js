// A "crossbar" is a class that provides structured notification registration.
// See _match for the definition of how a notification matches a trigger.
// All notifications and triggers must have a string key named 'collection'.
export default class Crossbar {
  constructor(options) {
    var self = this;
    options = options || {};

    self.listenerId = 1;
    self.bufferId = 1;
    // map from collection name (string) -> listener id -> object. each object has
    // keys 'trigger', 'callback'.  As a hack, the empty string means "no
    // collection".
    self.listenersByCollection = {};
    self.listenersByCollectionCount = {};
    // An object which holds the buffered changes per collection
    self.buffersPerCollection = {};
    // Buffer changes to the same collection which happen within x ms
    self.bufferInterval = 5;
    // Maximum age of the buffer
    self.bufferMaxAge = 100;
    // Maximum amount of notifications to store in the buffer before flushing
    self.bufferMaxSize = 2000;
    self.factPackage = options.factPackage || "livedata";
    self.factName = options.factName || null;
  }

  // msg is a trigger or a notification
  _collectionForMessage(msg) {
    var self = this;
    if (! _.has(msg, 'collection')) {
      return '';
    } else if (typeof(msg.collection) === 'string') {
      if (msg.collection === '')
        throw Error("Message has empty collection!");
      return msg.collection;
    } else {
      throw Error("Message has non-string collection!");
    }
  }

  // Listen for notification that match 'trigger'. A notification
  // matches if it has the key-value pairs in trigger as a
  // subset. When a notification matches, call 'callback', passing
  // the actual notification.
  //
  // Returns a listen handle, which is an object with a method
  // stop(). Call stop() to stop listening.
  //
  // XXX It should be legal to call fire() from inside a listen()
  // callback?
  listen(trigger, callback) {
    var self = this;
    var id = self.listenerId++;

    var collection = self._collectionForMessage(trigger);
    var record = {trigger: EJSON.clone(trigger), callback: callback};
    
    self.listenersByCollection[collection] = self.listenersByCollection[collection] || {};
    self.listenersByCollectionCount[collection] = 0;

    self.listenersByCollection[collection][id] = record;
    self.listenersByCollectionCount[collection]++;

    if (self.factName && Package['facts-base']) {
      Package['facts-base'].Facts.incrementServerFact(
        self.factPackage, self.factName, 1);
    }

    return {
      stop: function () {
        if (self.factName && Package['facts-base']) {
          Package['facts-base'].Facts.incrementServerFact(
            self.factPackage, self.factName, -1);
        }
        delete self.listenersByCollection[collection][id];
        self.listenersByCollectionCount[collection]--;
        if (self.listenersByCollectionCount[collection] === 0) {
          delete self.listenersByCollection[collection];
          delete self.listenersByCollectionCount[collection];
        }
      }
    };
  }

  // Fire the provided 'notification' (an object whose attribute
  // values are all JSON-compatibile) -- inform all matching listeners
  // (registered with listen()).
  //
  // If fire() is called inside a write fence, then each of the
  // listener callbacks will be called inside the write fence as well.
  //
  // The listeners may be invoked in parallel, rather than serially.
  fire(notification) {
    var self = this;
    var collection = self._collectionForMessage(notification);
    var listenersForCollection = self.listenersByCollection[collection];
    var bufferForCollection = self.buffersPerCollection[collection];

    if (listenersForCollection) {
      var callbackIds = [];

      _.each(listenersForCollection, function (listener, id) {
        if (self._matches(notification, listener.trigger)) {
          callbackIds.push(id);
        }
      });

      // Listener callbacks can yield, so we need to first find all the ones that
      // match in a single iteration over self.listenersByCollection (which can't
      // be mutated during this iteration), and then invoke the matching
      // callbacks, checking before each call to ensure they haven't stopped.
      // Note that we don't have to check that
      // self.listenersByCollection[collection] still === listenersForCollection,
      // because the only way that stops being true is if listenersForCollection
      // first gets reduced down to the empty object (and then never gets
      // increased again).
      _.each(callbackIds, function (id) {
        if (_.has(listenersForCollection, id)) {
          listenersForCollection[id].callback(notification);
        }
      });
    }

    if (bufferForCollection) {
      // Add the callback to the bufferedCalls
      bufferForCollection.notifications.push(notification);

      if (bufferForCollection.flushAt === null) {
        bufferForCollection.flushAt = new Date().valueOf() + self.bufferMaxAge;
      }
      
      if (
        bufferForCollection.notifications.length >= self.bufferMaxSize
        || self.flushAt < new Date().valueOf()
      ) {
        self.flush(collection);
        return;
      }

      if (bufferForCollection.handle) {
        clearTimeout(bufferForCollection.handle);
      }

      bufferForCollection.handle = setTimeout(
        self.flush.bind(self, [collection]),
        self.bufferInterval
      );
    }
  },

  buffer: function(trigger, callback) {
    var self = this;
    var id = self.bufferId++;

    var collection = self._collectionForMessage(trigger);
    var listener = {trigger: EJSON.clone(trigger), callback: callback};
    
    self.buffersPerCollection[collection] = self.buffersPerCollection[collection] || {
      listeners: [],
      notifications: [],
      handle: null,
      flushAt: null
    };

    self.buffersPerCollection[collection].listeners[id] = listener;

    return {
      stop: function () {
        delete self.buffersPerCollection[collection].listeners[id];

        if (_.isEmpty(self.buffersPerCollection[collection].listeners)) {
          clearTimeout(self.buffersPerCollection[collection].handle);

          delete self.buffersPerCollection[collection];
        }
      }
    };
  },

  flush(collection) {
    var self = this;
    var bufferForCollection = self.buffersPerCollection[collection];

    if (bufferForCollection.handle) {
      clearTimeout(bufferForCollection.handle);
      
      delete bufferForCollection.handle;
    }

    bufferForCollection.flushAt = null;

    var notifications = bufferForCollection.notifications;
    
    bufferForCollection.notifications = [];

    var filteredBuffers = {};

    // Determine which notifications we should send to each listener
    _.each(bufferForCollection.listeners, function (listener, id) {
      var triggerString = listener.trigger.toString();
      var filteredNotifications = filteredBuffers[triggerString] || [];

      // If did not already filter for the same trigger
      if (filteredNotifications.length === 0) {
        // Iterate over the buffered notifications
        _.each(notifications, function(notification) {
          if (self._matches(notification, listener.trigger)) {
            filteredNotifications.push(notification);
          }
        })
      }

      if (_.has(bufferForCollection.listeners, id)) {
        bufferForCollection.listeners[id].callback(filteredNotifications);
      }
    });
  }

  // A notification matches a trigger if all keys that exist in both are equal.
  //
  // Examples:
  //  N:{collection: "C"} matches T:{collection: "C"}
  //    (a non-targeted write to a collection matches a
  //     non-targeted query)
  //  N:{collection: "C", id: "X"} matches T:{collection: "C"}
  //    (a targeted write to a collection matches a non-targeted query)
  //  N:{collection: "C"} matches T:{collection: "C", id: "X"}
  //    (a non-targeted write to a collection matches a
  //     targeted query)
  //  N:{collection: "C", id: "X"} matches T:{collection: "C", id: "X"}
  //    (a targeted write to a collection matches a targeted query targeted
  //     at the same document)
  //  N:{collection: "C", id: "X"} does not match T:{collection: "C", id: "Y"}
  //    (a targeted write to a collection does not match a targeted query
  //     targeted at a different document)
  _matches(notification, trigger) {
    // Most notifications that use the crossbar have a string `collection` and
    // maybe an `id` that is a string or ObjectID. We're already dividing up
    // triggers by collection, but let's fast-track "nope, different ID" (and
    // avoid the overly generic EJSON.equals). This makes a noticeable
    // performance difference; see https://github.com/meteor/meteor/pull/3697
    if (typeof(notification.id) === 'string' &&
        typeof(trigger.id) === 'string' &&
        notification.id !== trigger.id) {
      return false;
    }
    if (notification.id instanceof MongoID.ObjectID &&
        trigger.id instanceof MongoID.ObjectID &&
        ! notification.id.equals(trigger.id)) {
      return false;
    }

    return _.all(trigger, function (triggerValue, key) {
      return !_.has(notification, key) ||
        EJSON.equals(triggerValue, notification[key]);
    });
  }
}
