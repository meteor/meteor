Meteor._InvalidationCrossbar = function () {
  var self = this;

  self.next_id = 1;
  // map from listener id to object. each object has keys 'trigger',
  // 'callback'.
  self.listeners = {};
};

_.extend(Meteor._InvalidationCrossbar.prototype, {
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
  //
  // Note: the LiveResultsSet constructor assumes that a call to listen() never
  // yields.
  listen: function (trigger, callback) {
    var self = this;
    var id = self.next_id++;
    self.listeners[id] = {trigger: EJSON.clone(trigger), callback: callback};
    return {
      stop: function () {
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
    _.each(self.listeners, function (l) {
      if (self._matches(notification, l.trigger))
        callbacks.push(l.callback);
    });

    if (onComplete)
      onComplete = Meteor.bindEnvironment(onComplete, function (e) {
        Meteor._debug("Exception in InvalidationCrossbar fire complete " +
                      "callback", e.stack);
      });

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

// singleton
Meteor._InvalidationCrossbar = new Meteor._InvalidationCrossbar;
