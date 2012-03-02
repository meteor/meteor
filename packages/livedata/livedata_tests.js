// XXX should probably move this into a testing helpers package so it
// can be used by other tests

var ExpectationManager = function (onComplete) {
  var self = this;

  self.onComplete = onComplete;
  self.closed = false;
  self.dead = false;
  self.outstanding = 0;
};

_.extend(ExpectationManager.prototype, {
  expect: function (/* arguments */) {
    var self = this;

    if (typeof arguments[0] === "function")
      var expected = arguments[0];
    else
      var expected = _.toArray(arguments);

    if (self.closed)
      throw new Error("Too late to add more expectations to the test");
    self.outstanding++;

    return function (/* arguments */) {
      if (typeof expected === "function")
        expected.apply({}, arguments);
      else
        assert.equal(_.toArray(arguments), expected);

      self.outstanding--;
      self._check_complete();
    };
  },

  done: function () {
    var self = this;
    self.closed = true;
    self._check_complete();
  },

  cancel: function () {
    var self = this;
    self.dead = true;
  },

  _check_complete: function () {
    var self = this;
    if (!self.outstanding && self.closed && !self.dead) {
      self.dead = true;
      self.onComplete();
    }
  }
});

var testAsyncMulti = function (name, funcs) {
  var timeout = 5000;

  testAsync(name, function (onComplete) {
    var remaining = _.clone(funcs);

    var runNext = function () {
      var func = remaining.shift();
      if (!func)
        onComplete();
      else {
        var em = new ExpectationManager(function () {
          Meteor.clearTimeout(timer);
          runNext();
        });

        var timer = Meteor.setTimeout(function () {
          em.cancel();
          test.fail({type: "timeout", message: "Async batch timed out"});
          onComplete();
          return;
        }, timeout);

        try {
          func(_.bind(em.expect, em));
        } catch (exception) {
          em.cancel();
          test.exception(exception);
          Meteor.clearTimeout(timer);
          onComplete();
          return;
        }
        em.done();
      }
    };

    runNext();
  });
};

/******************************************************************************/

// XXX should check error codes
var failure = function (code, reason) {
  return function (error, result) {
    assert.equal(result, undefined);
    assert.isTrue(error && typeof error === "object");
    if (error && typeof error === "object") {
      code && assert.equal(error.error, code);
      reason && assert.equal(error.reason, reason);
      // XXX should check that other keys aren't present.. should
      // probably use something like the Matcher we used to have
    }
  };
}

test("livedata - methods with colliding names", function () {
  var x = LocalCollection.uuid();
  var m = {};
  m[x] = function () {};
  App.methods(m);

  assert.throws(function () {
    App.methods(m);
  });
});

testAsyncMulti("livedata - basic method invocation", [
  function (expect) {
    try {
      var ret = App.call("unknown method",
                         expect(failure(404, "Method not found")));
    } catch (e) {
      // throws immediately on server, but still calls callback
      assert.isTrue(Meteor.is_server);
      return;
    }

    // returns undefined on client, then calls callback
    assert.isTrue(Meteor.is_client);
    assert.equal(ret, undefined);
  },

  function (expect) {
    var ret = App.call("echo", expect(undefined, []));
    assert.equal(ret, []);
  },

  function (expect) {
    var ret = App.call("echo", 12, expect(undefined, [12]));
    assert.equal(ret, [12]);
  },

  function (expect) {
    var ret = App.call("echo", 12, {x: 13}, expect(undefined, [12, {x: 13}]));
    assert.equal(ret, [12, {x: 13}]);
  },

  function (expect) {
    assert.throws(function () {
      var ret = App.call("exception", "both",
                         expect(failure(500, "Internal server error")));
    });
  },

  function (expect) {
    try {
      var ret = App.call("exception", "server",
                         expect(failure(500, "Internal server error")));
    } catch (e) {
      assert.isTrue(Meteor.is_server);
      return;
    }

    assert.isTrue(Meteor.is_client);
    assert.equal(ret, undefined);
  },

  function (expect) {
    if (Meteor.is_client) {
      assert.throws(function () {
        var ret = App.call("exception", "client", expect(undefined, undefined));
      });
    } else {
      var ret = App.call("exception", "client", expect(undefined, undefined));
      assert.equal(ret, undefined);
    }
  }

]);


var checkBalances = function (a, b) {
  var alice = Ledger.findOne({name: "alice", world: test.runId()});
  var bob = Ledger.findOne({name: "bob", world: test.runId()});
  assert.equal(alice.balance, a);
  assert.equal(bob.balance, b);
}

// would be nice to have a database-aware test harness of some kind --
// this is a big hack (and XXX pollutes the global test namespace)
testAsyncMulti("livedata - compound methods", [
  function () {
    if (Meteor.is_client)
      Meteor.subscribe("ledger", {world: test.runId()});
    Ledger.insert({name: "alice", balance: 100, world: test.runId()});
    Ledger.insert({name: "bob", balance: 50, world: test.runId()});
  },
  function (expect) {
    App.call('ledger/transfer', test.runId(), "alice", "bob", 10,
             expect(undefined, undefined));

    checkBalances(90, 60);

    var release = expect();
    App.onQuiesce(function () {
      checkBalances(90, 60);
      Meteor.defer(release);
    });
  },
  function (expect) {
    App.call('ledger/transfer', test.runId(), "alice", "bob", 100, true,
             expect(failure(409)));

    if (Meteor.is_client)
      // client can fool itself by cheating, but only until the sync
      // finishes
      checkBalances(-10, 160);
    else
      checkBalances(90, 60);

    var release = expect();
    App.onQuiesce(function () {
      checkBalances(90, 60);
      Meteor.defer(release);
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
