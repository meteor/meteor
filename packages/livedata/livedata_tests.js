// XXX should check error codes
var failure = function (test, code, reason) {
  return function (error, result) {
    test.equal(result, undefined);
    test.isTrue(error && typeof error === "object");
    if (error && typeof error === "object") {
      if (typeof code === "number") {
        test.instanceOf(error, Meteor.Error);
        code && test.equal(error.error, code);
        reason && test.equal(error.reason, reason);
        // XXX should check that other keys aren't present.. should
        // probably use something like the Matcher we used to have
      } else {
        // for normal Javascript errors
        test.instanceOf(error, Error);
        test.equal(error.message, code);
      }
    }
  };
};

Tinytest.add("livedata - Meteor.Error", function (test) {
  var error = new Meteor.Error(123, "kittens", "puppies");
  test.instanceOf(error, Error);
  test.equal(error.error, 123);
  test.equal(error.reason, "kittens");
  test.equal(error.details, "puppies");
});

Tinytest.add("livedata - methods with colliding names", function (test) {
  var x = LocalCollection.uuid();
  var m = {};
  m[x] = function () {};
  Meteor.methods(m);

  test.throws(function () {
    Meteor.methods(m);
  });
});

testAsyncMulti("livedata - basic method invocation", [
  // Unknown methods
  function (test, expect) {
    if (Meteor.isServer) {
      // On server, with no callback, throws exception
      try {
        var ret = Meteor.call("unknown method");
      } catch (e) {
        test.equal(e.error, 404);
        var threw = true;
      }
      test.isTrue(threw);
      test.equal(ret, undefined);
    }

    if (Meteor.isClient) {
      // On client, with no callback, just returns undefined
      var ret = Meteor.call("unknown method");
      test.equal(ret, undefined);
    }

    // On either, with a callback, calls the callback and does not throw
    var ret = Meteor.call("unknown method",
                          expect(failure(test, 404, "Method not found")));
    test.equal(ret, undefined);
  },

  function (test, expect) {
    // make sure 'undefined' is preserved as such, instead of turning
    // into null (JSON does not have 'undefined' so there is special
    // code for this)
    if (Meteor.isServer)
      test.equal(Meteor.call("nothing"), undefined);
    if (Meteor.isClient)
      test.equal(Meteor.call("nothing"), undefined);

    test.equal(Meteor.call("nothing", expect(undefined, undefined)), undefined);
  },

  function (test, expect) {
    if (Meteor.isServer)
      test.equal(Meteor.call("echo"), []);
    if (Meteor.isClient)
      test.equal(Meteor.call("echo"), undefined);

    test.equal(Meteor.call("echo", expect(undefined, [])), undefined);
  },

  function (test, expect) {
    if (Meteor.isServer)
      test.equal(Meteor.call("echo", 12), [12]);
    if (Meteor.isClient)
      test.equal(Meteor.call("echo", 12), undefined);

    test.equal(Meteor.call("echo", 12, expect(undefined, [12])), undefined);
  },

  function (test, expect) {
    if (Meteor.isServer)
      test.equal(Meteor.call("echo", 12, {x: 13}), [12, {x: 13}]);
    if (Meteor.isClient)
      test.equal(Meteor.call("echo", 12, {x: 13}), undefined);

    test.equal(Meteor.call("echo", 12, {x: 13},
                           expect(undefined, [12, {x: 13}])), undefined);
  },

  // test that `wait: false` is respected
  function (test, expect) {
    if (Meteor.isClient) {
      // For test isolation
      var token = Meteor.uuid();
      Meteor.apply(
        "delayedTrue", [token], {wait: false}, expect(function(err, res) {
          test.equal(res, false);
        }));
      Meteor.apply("makeDelayedTrueImmediatelyReturnFalse", [token]);
    }
  },

  // test that `wait: true` is respected
  function(test, expect) {
    if (Meteor.isClient) {
      var token = Meteor.uuid();
      Meteor.apply(
        "delayedTrue", [token], {wait: true}, expect(function(err, res) {
          test.equal(res, true);
        }));
      Meteor.apply("makeDelayedTrueImmediatelyReturnFalse", [token]);
    }
  },

  function (test, expect) {
    // No callback

    if (Meteor.isServer) {
      test.throws(function () {
        Meteor.call("exception", "both");
      });
      test.throws(function () {
        Meteor.call("exception", "server");
      });
      // No exception, because no code will run on the client
      test.equal(Meteor.call("exception", "client"), undefined);
    }

    if (Meteor.isClient) {
      // The client exception is thrown away because it's in the
      // stub. The server exception is throw away because we didn't
      // give a callback.
      test.equal(Meteor.call("exception", "both"), undefined);
      test.equal(Meteor.call("exception", "server"), undefined);
      test.equal(Meteor.call("exception", "client"), undefined);
    }

    // With callback

    if (Meteor.isClient) {
      test.equal(
        Meteor.call("exception", "both",
                    expect(failure(test, 500, "Internal server error"))),
        undefined);
      test.equal(
        Meteor.call("exception", "server",
                    expect(failure(test, 500, "Internal server error"))),
        undefined);
      test.equal(Meteor.call("exception", "client"), undefined);
    }

    if (Meteor.isServer) {
      test.equal(
        Meteor.call("exception", "both",
                    expect(failure(test, "Test method throwing an exception"))),
        undefined);
      test.equal(
        Meteor.call("exception", "server",
                    expect(failure(test, "Test method throwing an exception"))),
        undefined);
      test.equal(Meteor.call("exception", "client"), undefined);
    }
  },

  function (test, expect) {
    if (Meteor.isServer) {
      var threw = false;
      try {
        Meteor.call("exception", "both", true);
      } catch (e) {
        threw = true;
        test.equal(e.error, 999);
        test.equal(e.reason, "Client-visible test exception");
      }
      test.isTrue(threw);
    }

    if (Meteor.isClient) {
      test.equal(
        Meteor.call("exception", "both", true,
                    expect(failure(test, 999,
                                   "Client-visible test exception"))),
        undefined);
      test.equal(
        Meteor.call("exception", "server", true,
                    expect(failure(test, 999,
                                   "Client-visible test exception"))),
        undefined);
    }
  }
]);




var checkBalances = function (test, a, b) {
  var alice = Ledger.findOne({name: "alice", world: test.runId()});
  var bob = Ledger.findOne({name: "bob", world: test.runId()});
  test.equal(alice.balance, a);
  test.equal(bob.balance, b);
};

// would be nice to have a database-aware test harness of some kind --
// this is a big hack (and XXX pollutes the global test namespace)
testAsyncMulti("livedata - compound methods", [
  function (test, expect) {
    if (Meteor.isClient)
      Meteor.subscribe("ledger", test.runId(), expect());

    Ledger.insert({name: "alice", balance: 100, world: test.runId()},
                  expect(function () {}));
    Ledger.insert({name: "bob", balance: 50, world: test.runId()},
                  expect(function () {}));
  },
  function (test, expect) {
    Meteor.call('ledger/transfer', test.runId(), "alice", "bob", 10,
                expect(function(err, result) {
                  test.equal(err, undefined);
                  test.equal(result, undefined);
                  checkBalances(test, 90, 60);
                }));
    checkBalances(test, 90, 60);
  },
  function (test, expect) {
    Meteor.call('ledger/transfer', test.runId(), "alice", "bob", 100, true,
                expect(function (err, result) {
                  failure(test, 409)(err, result);
                  // Balances are reverted back to pre-stub values.
                  checkBalances(test, 90, 60);
                }));

    if (Meteor.isClient)
      // client can fool itself by cheating, but only until the sync
      // finishes
      checkBalances(test, -10, 160);
    else
      checkBalances(test, 90, 60);
  }
]);

// Replaces the LivedataConnection's `_livedata_data` method to push
// incoming messages on a given collection to an array. This can be
// used to verify that the right data is sent on the wire
//
// @param messages {Array} The array to which to append the messages
// @return {Function} A function to call to undo the eavesdropping
var eavesdropOnCollection = function(livedata_connection,
                                     collection_name, messages) {
  var old_livedata_data = _.bind(
    livedata_connection._livedata_data, livedata_connection);

  // Kind of gross since all tests past this one will run with this
  // hook set up. That's probably fine since we only check a specific
  // collection but still...
  //
  // Should we consider having a separate connection per Tinytest or
  // some similar scheme?
  livedata_connection._livedata_data = function(msg) {
    if (msg.collection && msg.collection === collection_name) {
      messages.push(msg);
    }
    old_livedata_data(msg);
  };

  return function() {
    livedata_connection._livedata_data = old_livedata_data;
  };
};

testAsyncMulti("livedata - changing userid reruns subscriptions without flapping data on the wire", [
  function(test, expect) {
    if (Meteor.isClient) {
      var messages = [];
      var undoEavesdrop = eavesdropOnCollection(
        Meteor.default_connection, "objectsWithUsers", messages);

      // A helper for testing incoming set and unset messages
      // XXX should this be extracted as a general helper together with
      // eavesdropOnCollection?
      var testSetAndUnset = function(expectation) {
        test.equal(_.map(messages, function(msg) {
          var result = {};
          if (msg.set)
            result.set = msg.set.name;
          if (msg.unset)
            result.unset = true;
          return result;
        }), expectation);
        messages.length = 0; // clear messages without creating a new object
      };

      Meteor.subscribe("objectsWithUsers", expect(function() {
        testSetAndUnset([{set: "owned by none"}]);
        test.equal(objectsWithUsers.find().count(), 1);

        Meteor.apply("setUserId", [1], {wait: true}, afterFirstSetUserId);
      }));

      var afterFirstSetUserId = expect(function() {
        testSetAndUnset([
          {unset: true},
          {set: "owned by one - a"},
          {set: "owned by one/two - a"},
          {set: "owned by one/two - b"}]);
        test.equal(objectsWithUsers.find().count(), 3);

        Meteor.apply("setUserId", [2], {wait: true}, afterSecondSetUserId);
      });

      var afterSecondSetUserId = expect(function() {
        testSetAndUnset([
          {unset: true},
          {set: "owned by two - a"},
          {set: "owned by two - b"}]);
        test.equal(objectsWithUsers.find().count(), 4);

        Meteor.apply("setUserId", [2], {wait: true}, afterThirdSetUserId);
      });

      var afterThirdSetUserId = expect(function() {
        // Nothing should have been sent since the results of the
        // query are the same ("don't flap data on the wire")
        testSetAndUnset([]);
        test.equal(objectsWithUsers.find().count(), 4);
        undoEavesdrop();
      });
    }
  }, function(test, expect) {
    if (Meteor.isClient) {
      Meteor.subscribe("recordUserIdOnStop");
      Meteor.apply("setUserId", [100], {wait: true}, expect(function() {}));
      Meteor.apply("setUserId", [101], {wait: true}, expect(function() {}));
      Meteor.call("userIdWhenStopped", expect(function(err, result) {
        test.equal(result, 100);
      }));
    }
  }
]);

Tinytest.add("livedata - setUserId error when called from server", function(test) {
  if (Meteor.isServer) {
    test.equal(errorThrownWhenCallingSetUserIdDirectlyOnServer.message,
               "Can't call setUserId on a server initiated method call");
  }
});

// XXX some things to test in greater detail:
// staying in simulation mode
// time warp
// serialization / beginAsync(true) / beginAsync(false)
// malformed messages (need raw wire access)
// method completion/satisfaction
// subscriptions (multiple APIs, including autosubscribe?)
// subscription completion
// subscription attribute shadowing
// server method calling methods on other server (eg, should simulate)
// subscriptions and methods being idempotent
// reconnection
// reconnection not resulting in method re-execution
// reconnection tolerating all kinds of lost messages (including data)
// [probably lots more]
