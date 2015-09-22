Meteor.methods({
  nothing: function () {
    // No need to check if there are no arguments.
  },
  echo: function (/* arguments */) {
    check(arguments, [Match.Any]);
    return _.toArray(arguments);
  },
  echoOne: function (/*arguments*/) {
    check(arguments, [Match.Any]);
    return arguments[0];
  },
  exception: function (where, options) {
    check(where, String);
    check(options, Match.Optional({
      intended: Match.Optional(Boolean),
      throwThroughFuture: Match.Optional(Boolean)
    }));
    options = options || {};
    var shouldThrow =
      (Meteor.isServer && where === "server") ||
      (Meteor.isClient && where === "client") ||
      where === "both";

    if (shouldThrow) {
      var e;
      if (options.intended)
        e = new Meteor.Error(999, "Client-visible test exception");
      else
        e = new Error("Test method throwing an exception");
      e.expected = true;

      // We used to improperly serialize errors that were thrown through a
      // future first.
      if (Meteor.isServer && options.throwThroughFuture) {
        var Future = Npm.require('fibers/future');
        var f = new Future;
        f['throw'](e);
        e = f.wait();
      }
      throw e;
    }
  },
  setUserId: function(userId) {
    check(userId, Match.OneOf(String, null));
    this.setUserId(userId);
  }
});

// Methods to help test applying methods with `wait: true`: delayedTrue returns
// true 1s after being run unless makeDelayedTrueImmediatelyReturnFalse was run
// in the meanwhile. Increasing the timeout makes the "wait: true" test slower;
// decreasing the timeout makes the "wait: false" test flakier (ie, the timeout
// could fire before processing the second method).
if (Meteor.isServer) {
  // Keys are random tokens, used to isolate multiple test invocations from each
  // other.
  var waiters = {};

  var path = Npm.require('path');
  var Future = Npm.require(path.join('fibers', 'future'));

  var returnThroughFuture = function (token, returnValue) {
    // Make sure that when we call return, the fields are already cleared.
    var record = waiters[token];
    if (!record)
      return;
    delete waiters[token];
    record.future['return'](returnValue);
  };

  Meteor.methods({
    delayedTrue: function(token) {
      check(token, String);
      var record = waiters[token] = {
        future: new Future(),
        timer: Meteor.setTimeout(function() {
          returnThroughFuture(token, true);
        }, 1000)
      };

      this.unblock();
      return record.future.wait();
    },
    makeDelayedTrueImmediatelyReturnFalse: function(token) {
      check(token, String);
      var record = waiters[token];
      if (!record)
        return; // since delayedTrue's timeout had already run
      clearTimeout(record.timer);
      returnThroughFuture(token, false);
    }
  });
}

/*****/

Ledger = new Mongo.Collection("ledger");
Ledger.allow({
  insert: function() { return true; },
  update: function() { return true; },
  remove: function() { return true; },
  fetch: []
});

Meteor.startup(function () {
  if (Meteor.isServer)
    Ledger.remove({}); // XXX can this please be Ledger.remove()?
});

if (Meteor.isServer)
  Meteor.publish('ledger', function (world) {
    check(world, String);
    return Ledger.find({world: world});
  });

Meteor.methods({
  'ledger/transfer': function (world, from_name, to_name, amount, cheat) {
    check(world, String);
    check(from_name, String);
    check(to_name, String);
    check(amount, Number);
    check(cheat, Match.Optional(Boolean));
    var from = Ledger.findOne({name: from_name, world: world});
    var to = Ledger.findOne({name: to_name, world: world});

    if (Meteor.isServer)
      cheat = false;

    if (!from)
      throw new Meteor.Error(404,
                             "No such account " + from_name + " in " + world);

    if (!to)
      throw new Meteor.Error(404,
                             "No such account " + to_name + " in " + world);

    if (from.balance < amount && !cheat)
      throw new Meteor.Error(409, "Insufficient funds");

    Ledger.update(from._id, {$inc: {balance: -amount}});
    Ledger.update(to._id, {$inc: {balance: amount}});
  }
});

/*****/

/// Helpers for "livedata - changing userid reruns subscriptions..."

objectsWithUsers = new Mongo.Collection("objectsWithUsers");

if (Meteor.isServer) {
  objectsWithUsers.remove({});
  objectsWithUsers.insert({name: "owned by none", ownerUserIds: [null]});
  objectsWithUsers.insert({name: "owned by one - a", ownerUserIds: ["1"]});
  objectsWithUsers.insert({name: "owned by one/two - a", ownerUserIds: ["1", "2"]});
  objectsWithUsers.insert({name: "owned by one/two - b", ownerUserIds: ["1", "2"]});
  objectsWithUsers.insert({name: "owned by two - a", ownerUserIds: ["2"]});
  objectsWithUsers.insert({name: "owned by two - b", ownerUserIds: ["2"]});

  Meteor.publish("objectsWithUsers", function() {
    return objectsWithUsers.find({ownerUserIds: this.userId},
                                 {fields: {ownerUserIds: 0}});
  });

  (function () {
    var userIdWhenStopped = {};
    Meteor.publish("recordUserIdOnStop", function (key) {
      check(key, String);
      var self = this;
      self.onStop(function() {
        userIdWhenStopped[key] = self.userId;
      });
    });

    Meteor.methods({
      userIdWhenStopped: function (key) {
        check(key, String);
        return userIdWhenStopped[key];
      }
    });
  })();
}

/*****/

/// Helper for "livedata - setUserId fails when called on server"

if (Meteor.isServer) {
  Meteor.startup(function() {
    errorThrownWhenCallingSetUserIdDirectlyOnServer = null;
    try {
      Meteor.call("setUserId", "1000");
    } catch (e) {
      errorThrownWhenCallingSetUserIdDirectlyOnServer = e;
    }
  });
}

/// Helper for "livedata - no setUserId after unblock"

if (Meteor.isServer) {
  Meteor.methods({
    setUserIdAfterUnblock: function () {
      this.unblock();
      var threw = false;
      var originalUserId = this.userId;
      try {
        // Calling setUserId after unblock should throw an error (and not mutate
        // userId).
        this.setUserId(originalUserId + "bla");
      } catch (e) {
        threw = true;
      }
      return threw && this.userId === originalUserId;
    }
  });
}

/*****/

/// Helper for "livedata - overlapping universal subs"

if (Meteor.isServer) {
  (function(){
    var collName = "overlappingUniversalSubs";
    var universalSubscribers = [[], []];

    _.each([0, 1], function (index) {
      Meteor.publish(null, function () {
        var sub = this;
        universalSubscribers[index].push(sub);
        sub.onStop(function () {
          universalSubscribers[index] = _.without(
            universalSubscribers[index], sub);
        });
      });
    });

    Meteor.methods({
      testOverlappingSubs: function (token) {
        check(token, String);
        _.each(universalSubscribers[0], function (sub) {
          sub.added(collName, token, {});
        });
        _.each(universalSubscribers[1], function (sub) {
          sub.added(collName, token, {});
        });
        _.each(universalSubscribers[0], function (sub) {
          sub.removed(collName, token);
        });
      }
    });
  })();
}

/// Helper for "livedata - runtime universal sub creation"

if (Meteor.isServer) {
  Meteor.methods({
    runtimeUniversalSubCreation: function (token) {
      check(token, String);
      Meteor.publish(null, function () {
        this.added("runtimeSubCreation", token, {});
      });
    }
  });
}

/// Helper for "livedata - publisher errors"

if (Meteor.isServer) {
  Meteor.publish("publisherErrors", function (collName, options) {
    check(collName, String);
    // See below to see what options are accepted.
    check(options, Object);
    var sub = this;

    // First add a random item, which should be cleaned up. We use ready/onReady
    // to make sure that the second test block is only called after the added is
    // processed, so that there's any chance of the coll.find().count() failing.
    sub.added(collName, Random.id(), {foo: 42});
    sub.ready();

    if (options.stopInHandler) {
      sub.stop();
      return;
    }

    var error;
    if (options.internalError) {
      error = new Error("Egads!");
      error.expected = true;  // don't log
    } else {
      error = new Meteor.Error(412, "Explicit error");
    }
    if (options.throwInHandler) {
      throw error;
    } else if (options.errorInHandler) {
      sub.error(error);
    } else if (options.throwWhenUserIdSet) {
      if (sub.userId)
        throw error;
    } else if (options.errorLater) {
      Meteor.defer(function () {
        sub.error(error);
      });
    }
  });
}


/*****/

/// Helpers for "livedata - publish multiple cursors"
One = new Mongo.Collection("collectionOne");
Two = new Mongo.Collection("collectionTwo");

if (Meteor.isServer) {
  One.remove({});
  One.insert({name: "value1"});
  One.insert({name: "value2"});

  Two.remove({});
  Two.insert({name: "value3"});
  Two.insert({name: "value4"});
  Two.insert({name: "value5"});

  Meteor.publish("multiPublish", function (options) {
    // See below to see what options are accepted.
    check(options, Object);
    if (options.normal) {
      return [
        One.find(),
        Two.find()
      ];
    } else if (options.dup) {
      // Suppress the log of the expected internal error.
      Meteor._suppress_log(1);
      return [
        One.find(),
        One.find({name: "value2"}), // multiple cursors for one collection - error
        Two.find()
      ];
    } else if (options.notCursor) {
      // Suppress the log of the expected internal error.
      Meteor._suppress_log(1);
      return [
        One.find(),
        "not a cursor",
        Two.find()
      ];
    } else
      throw "unexpected options";
  });
}


/// Helper for "livedata - result by value"
var resultByValueArrays = {};
Meteor.methods({
  'getArray': function (testId) {
    if (! _.has(resultByValueArrays, testId))
      resultByValueArrays[testId] = [];
    return resultByValueArrays[testId];
  },
  'pushToArray': function (testId, value) {
    if (! _.has(resultByValueArrays, testId))
      resultByValueArrays[testId] = [];
    resultByValueArrays[testId].push(value);
  }
});
