// A "crossbar" is a class that provides structured notification registration.
// The "invalidation crossbar" is a specific instance used by the DDP server to
// implement write fence notifications.

DDPServer._Crossbar = function (options) {
  var self = this;
  options = options || {};

  self.nextId = 1;
  // map from listener id to object. each object has keys 'trigger',
  // 'callback'.
  self.listeners = {};
  self.factPackage = options.factPackage || "livedata";
  self.factName = options.factName || null;
};

_.extend(DDPServer._Crossbar.prototype, {
  // Listen for notification that match 'trigger'. A notification
  // matches if it has the key-value pairs in trigger as a
  // subset. When a notification matches, call 'callback', passing two
  // arguments, the actual notification and an acknowledgement
  // function. The callback should call the acknowledgement function
  // when it is finished processing the notification.
  //
  // Returns a listen handle, which is an object with a method
  // stop(). Call stop() to stop listening.
  //
  // XXX It should be legal to call fire() from inside a listen()
  // callback?
  listen: function (trigger, callback) {
    var self = this;
    var id = self.nextId++;
    self.listeners[id] = {trigger: EJSON.clone(trigger), callback: callback};
    if (self.factName && Package.facts) {
      Package.facts.Facts.incrementServerFact(
        self.factPackage, self.factName, 1);
    }
    return {
      stop: function () {
        if (self.factName && Package.facts) {
          Package.facts.Facts.incrementServerFact(
            self.factPackage, self.factName, -1);
        }
        delete self.listeners[id];
      }
    };
  },

  // Fire the provided 'notification' (an object whose attribute
  // values are all JSON-compatibile) -- inform all matching listeners
  // (registered with listen()), and once they have all acknowledged
  // the notification, call onComplete with no arguments.
  //
  // If fire() is called inside a write fence, then each of the
  // listener callbacks will be called inside the write fence as well.
  //
  // The listeners may be invoked in parallel, rather than serially.
  fire: function (notification, onComplete) {
    var self = this;
    var callbacks = [];
    // XXX consider refactoring to "index" on "collection"
    _.each(self.listeners, function (l) {
      if (self._matches(notification, l.trigger))
        callbacks.push(l.callback);
    });

    if (onComplete)
      onComplete = Meteor.bindEnvironment(
        onComplete,
        "Crossbar fire complete callback");

    var outstanding = callbacks.length;
    if (!outstanding)
      onComplete && onComplete();
    else {
      _.each(callbacks, function (c) {
        c(notification, function () {
          if (--outstanding === 0)
            onComplete && onComplete();
        });
      });
    }
  },

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
  _matches: function (notification, trigger) {
    return _.all(trigger, function (triggerValue, key) {
      return !_.has(notification, key) ||
        EJSON.equals(triggerValue, notification[key]);
    });
  }
});

DDPServer._InvalidationCrossbar = new DDPServer._Crossbar({
  factName: "invalidation-crossbar-listeners"
});
