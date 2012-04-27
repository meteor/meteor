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
}

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
    if (Meteor.is_server) {
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

    if (Meteor.is_client) {
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
    if (Meteor.is_server)
      test.equal(Meteor.call("nothing"), undefined);
    if (Meteor.is_client)
      test.equal(Meteor.call("nothing"), undefined);

    test.equal(Meteor.call("nothing", expect(undefined, undefined)), undefined);
  },

  function (test, expect) {
    if (Meteor.is_server)
      test.equal(Meteor.call("echo"), []);
    if (Meteor.is_client)
      test.equal(Meteor.call("echo"), undefined);

    test.equal(Meteor.call("echo", expect(undefined, [])), undefined);
  },

  function (test, expect) {
    if (Meteor.is_server)
      test.equal(Meteor.call("echo", 12), [12]);
    if (Meteor.is_client)
      test.equal(Meteor.call("echo", 12), undefined);

    test.equal(Meteor.call("echo", 12, expect(undefined, [12])), undefined);
  },

  function (test, expect) {
    if (Meteor.is_server)
      test.equal(Meteor.call("echo", 12, {x: 13}), [12, {x: 13}]);
    if (Meteor.is_client)
      test.equal(Meteor.call("echo", 12, {x: 13}), undefined);

    test.equal(Meteor.call("echo", 12, {x: 13},
                           expect(undefined, [12, {x: 13}])), undefined);
  },

  function (test, expect) {
    // No callback

    if (Meteor.is_server) {
      test.throws(function () {
        Meteor.call("exception", "both");
      });
      test.throws(function () {
        Meteor.call("exception", "server");
      });
      // No exception, because no code will run on the client
      test.equal(Meteor.call("exception", "client"), undefined);
    }

    if (Meteor.is_client) {
      // The client exception is thrown away because it's in the
      // stub. The server exception is throw away because we didn't
      // give a callback.
      test.equal(Meteor.call("exception", "both"), undefined);
      test.equal(Meteor.call("exception", "server"), undefined);
      test.equal(Meteor.call("exception", "client"), undefined);
    }

    // With callback

    if (Meteor.is_client) {
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

    if (Meteor.is_server) {
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
    if (Meteor.is_server) {
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

    if (Meteor.is_client) {
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
}

var onQuiesce = function (f) {
  if (Meteor.is_server)
    f();
  else
    Meteor.default_connection.onQuiesce(f);
};

// would be nice to have a database-aware test harness of some kind --
// this is a big hack (and XXX pollutes the global test namespace)
testAsyncMulti("livedata - compound methods", [
  function (test) {
    if (Meteor.is_client)
      Meteor.subscribe("ledger", test.runId());
    Ledger.insert({name: "alice", balance: 100, world: test.runId()});
    Ledger.insert({name: "bob", balance: 50, world: test.runId()});
  },
  function (test, expect) {
    Meteor.call('ledger/transfer', test.runId(), "alice", "bob", 10,
                expect(undefined, undefined));

    checkBalances(test, 90, 60);

    var release = expect();
    onQuiesce(function () {
      checkBalances(test, 90, 60);
      Tinytest.defer(release);
    });
  },
  function (test, expect) {
    Meteor.call('ledger/transfer', test.runId(), "alice", "bob", 100, true,
                expect(failure(test, 409)));

    if (Meteor.is_client)
      // client can fool itself by cheating, but only until the sync
      // finishes
      checkBalances(test, -10, 160);
    else
      checkBalances(test, 90, 60);

    var release = expect();
    onQuiesce(function () {
      checkBalances(test, 90, 60);
      Tinytest.defer(release);
    });
  }
]);


// XXX some things to test in greater detail:
// staying in simulation mode
// time warp
// serialization / beginAsync(true) / beginAsync(false)
// malformed messages (need raw wire access)
// method completion/satisfaction
// subscriptions (multiple APIs, including autosubscribe?)
// subscription completion
// server method calling methods on other server (eg, should simulate)
// subscriptions and methods being idempotent
// reconnection
// reconnection not resulting in method re-execution
// reconnection tolerating all kinds of lost messages (including data)
// [probably lots more]
