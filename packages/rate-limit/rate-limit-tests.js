// These tests were written before rate-limit was factored outside of DDP Rate
// Limiter and thus are structured with DDP method invocations in mind. These
// rules still test abstract rate limit package behavior. The tests currently
// implemented are:
// * Empty rule set on RateLimiter construction
// * Multiple inputs, only 1 that matches rule and reaches rate limit
// * Multiple inputs, 1 hits rate limit, wait for reset, after which inputs
//   allowed
// * 2 rules, 3 inputs where 2/3 match 1 rule and thus hit rate limit. Second
//   input matches another rule and hits rate limit while 3rd rule not rate
//   limited
// * One rule affected by two inputs still throws
// * Global rule triggers on any invocation after reaching limit
// * Fuzzy rule matching triggers rate limit only when input has more keys than
//   rule
// * matchRule tests that have various levels of similarity in input and rule
// * generateKeyString tests for various matches creating appropriate string
//
// XXX These tests should be refactored to use Tinytest.add instead of
// testAsyncMulti as they're all on the server. Any future tests should be
// written that way.
Tinytest.add('rate limit tests - Check empty constructor creation',
  function (test) {
    r = new RateLimiter();
    test.equal(r.rules, {});
});

Tinytest.add('rate limit tests - Check single rule with multiple ' +
  'invocations, only 1 that matches',
  function (test) {
    r = new RateLimiter();
    var userIdOne = 1;
    var restrictJustUserIdOneRule = {
      userId: userIdOne,
      IPAddr: null,
      method: null
    };

    r.addRule(restrictJustUserIdOneRule, 1, 1000);
    var connectionHandle = createTempConnectionHandle(123, '127.0.0.1');
    var methodInvc1 = createTempMethodInvocation(userIdOne, connectionHandle,
      'login');
    var methodInvc2 = createTempMethodInvocation(2, connectionHandle,
      'login');
    for (var i = 0; i < 2; i++) {
      r.increment(methodInvc1);
      r.increment(methodInvc2);
    }
    test.equal(r.check(methodInvc1).allowed, false);
    test.equal(r.check(methodInvc2).allowed, true);
  });

testAsyncMulti("rate limit tests - Run multiple invocations and wait for one" +
  " to reset", [
  function (test, expect) {
    var self = this;
    self.r = new RateLimiter();
    self.userIdOne = 1;
    self.userIdTwo = 2;
    self.restrictJustUserIdOneRule = {
      userId: self.userIdOne,
      IPAddr: null,
      method: null
    };
    self.r.addRule(self.restrictJustUserIdOneRule, 1, 1000);
    self.connectionHandle = createTempConnectionHandle(123, '127.0.0.1')
    self.methodInvc1 = createTempMethodInvocation(self.userIdOne,
      self.connectionHandle, 'login');
    self.methodInvc2 = createTempMethodInvocation(self.userIdTwo,
      self.connectionHandle, 'login');
    for (var i = 0; i < 2; i++) {
      self.r.increment(self.methodInvc1);
      self.r.increment(self.methodInvc2);
    }
    test.equal(self.r.check(self.methodInvc1).allowed, false);
    test.equal(self.r.check(self.methodInvc2).allowed, true);
    Meteor.setTimeout(expect(function () {}), 1000);
  },
  function (test, expect) {
    var self = this;
    for (var i = 0; i < 100; i++) {
      self.r.increment(self.methodInvc2);
    }

    test.equal(self.r.check(self.methodInvc1).allowed, true);
    test.equal(self.r.check(self.methodInvc2).allowed, true);
  }
]);

Tinytest.add('rate limit tests - Check two rules that affect same methodInvc' +
  ' still throw',
  function (test) {
    r = new RateLimiter();
    var loginMethodRule = {
      userId: null,
      IPAddr: null,
      method: 'login'
    };
    var onlyLimitEvenUserIdRule = {
      userId: function (userId) {
        return userId % 2 === 0
      },
      IPAddr: null,
      method: null
    };
    r.addRule(loginMethodRule, 10, 100);
    r.addRule(onlyLimitEvenUserIdRule, 4, 100);

    var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
    var methodInvc1 = createTempMethodInvocation(1, connectionHandle,
      'login');
    var methodInvc2 = createTempMethodInvocation(2, connectionHandle,
      'login');
    var methodInvc3 = createTempMethodInvocation(3, connectionHandle,
      'test');

    for (var i = 0; i < 5; i++) {
      r.increment(methodInvc1);
      r.increment(methodInvc2);
      r.increment(methodInvc3);
    };

    // After for loop runs, we only have 10 runs, so that's under the limit
    test.equal(r.check(methodInvc1).allowed, true);
    // However, this triggers userId rule since this userId is even
    test.equal(r.check(methodInvc2).allowed, false);
    test.equal(r.check(methodInvc2).allowed, false);

    // Running one more test causes it to be false, since we're at 11 now.
    r.increment(methodInvc1);
    test.equal(r.check(methodInvc1).allowed, false);
    // 3rd Method Invocation isn't affected by either rules.
    test.equal(r.check(methodInvc3).allowed, true);

  });

Tinytest.add('rate limit tests - Check one rule affected by two different ' +
  'invocations',
  function (test) {
    r = new RateLimiter();
    var loginMethodRule = {
      userId: null,
      IPAddr: null,
      method: 'login'
    }
    r.addRule(loginMethodRule, 10, 10000);

    var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
    var methodInvc1 = createTempMethodInvocation(1, connectionHandle,
      'login');
    var methodInvc2 = createTempMethodInvocation(2, connectionHandle,
      'login');

    for (var i = 0; i < 5; i++) {
      r.increment(methodInvc1);
      r.increment(methodInvc2);
    }
    // This throws us over the limit since both increment the login rule
    // counter
    r.increment(methodInvc1);

    test.equal(r.check(methodInvc1).allowed, false);
    test.equal(r.check(methodInvc2).allowed, false);
  });

Tinytest.add("rate limit tests - add global rule", function (test) {
  r = new RateLimiter();
  var globalRule = {
    userId: null,
    IPAddr: null,
    method: null
  }
  r.addRule(globalRule, 1, 10000);

  var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
  var connectionHandle2 = createTempConnectionHandle(1234, '127.0.0.2');

  var methodInvc1 = createTempMethodInvocation(1, connectionHandle,
    'login');
  var methodInvc2 = createTempMethodInvocation(2, connectionHandle2,
    'test');
  var methodInvc3 = createTempMethodInvocation(3, connectionHandle,
    'user-accounts');

  // First invocation, all methods would still be allowed.
  r.increment(methodInvc2);
  test.equal(r.check(methodInvc1).allowed, true);
  test.equal(r.check(methodInvc2).allowed, true);
  test.equal(r.check(methodInvc3).allowed, true);
  // Second invocation, everything has reached common rate limit
  r.increment(methodInvc3);
  test.equal(r.check(methodInvc1).allowed, false);
  test.equal(r.check(methodInvc2).allowed, false);
  test.equal(r.check(methodInvc3).allowed, false);
});

Tinytest.add('rate limit tests - Fuzzy rule match does not trigger rate limit',
  function (test) {
    r = new RateLimiter();
    var rule = {
      a: function (inp) {
        return inp % 3 == 0
      },
      b: 5,
      c: "hi",
    }
    r.addRule(rule, 1, 10000);
    var input = {
      a: 3,
      b: 5
    }
    for (var i = 0; i < 5; i++) {
      r.increment(input);
    }
    test.equal(r.check(input).allowed, true);
    var matchingInput = {
      a: 3,
      b: 5,
      c: "hi",
      d: 1
    }
    r.increment(matchingInput);
    r.increment(matchingInput);
    // Past limit so should be false
    test.equal(r.check(matchingInput).allowed, false);

    // Add secondary rule and check that longer time is returned when multiple
    // rules limits are hit
    var newRule = {
      a: function (inp) {
        return inp % 3 == 0
      },
      b: 5,
      c: "hi",
      d: 1
    }
    r.addRule(newRule, 1, 10);
    // First rule should still throw while second rule will trigger as well,
    // causing us to return longer time to reset to user
    r.increment(matchingInput);
    r.increment(matchingInput);
    test.equal(r.check(matchingInput).timeToReset > 50, true);
  }
);


/****** Test Our Helper Methods *****/

Tinytest.add("rate limit tests - test matchRule method", function (test) {
  r = new RateLimiter();
  var globalRule = {
    userId: null,
    IPAddr: null,
    type: null,
    name: null
  }
  var globalRuleId = r.addRule(globalRule);

  var rateLimiterInput = {
    userId: 1023,
    IPAddr: "127.0.0.1",
    type: 'sub',
    name: 'getSubLists'
  };

  test.equal(r.rules[globalRuleId].match(rateLimiterInput), true);

  var oneNotNullRule = {
    userId: 102,
    IPAddr: null,
    type: null,
    name: null
  }

  var oneNotNullId = r.addRule(oneNotNullRule);
  test.equal(r.rules[oneNotNullId].match(rateLimiterInput), false);

  oneNotNullRule.userId = 1023;
  test.equal(r.rules[oneNotNullId].match(rateLimiterInput), true);

  var notCompleteInput = {
    userId: 102,
    IPAddr: '127.0.0.1'
  };
  test.equal(r.rules[globalRuleId].match(notCompleteInput), true);
  test.equal(r.rules[oneNotNullId].match(notCompleteInput), false);
});

Tinytest.add('rate limit tests - test generateMethodKey string',
  function (test) {
    r = new RateLimiter();
    var globalRule = {
      userId: null,
      IPAddr: null,
      type: null,
      name: null
    }
    var globalRuleId = r.addRule(globalRule);

    var rateLimiterInput = {
      userId: 1023,
      IPAddr: "127.0.0.1",
      type: 'sub',
      name: 'getSubLists'
    };

    test.equal(r.rules[globalRuleId]._generateKeyString(rateLimiterInput), "");
    globalRule.userId = 1023;

    test.equal(r.rules[globalRuleId]._generateKeyString(rateLimiterInput),
      "userId1023");

    var ruleWithFuncs = {
      userId: function (input) {
        return input % 2 === 0
      },
      IPAddr: null,
      type: null
    };
    var funcRuleId = r.addRule(ruleWithFuncs);
    test.equal(r.rules[funcRuleId]._generateKeyString(rateLimiterInput), "");
    rateLimiterInput.userId = 1024;
    test.equal(r.rules[funcRuleId]._generateKeyString(rateLimiterInput),
      "userId1024");

    var multipleRules = ruleWithFuncs;
    multipleRules.IPAddr = '127.0.0.1';
    var multipleRuleId = r.addRule(multipleRules);
    test.equal(r.rules[multipleRuleId]._generateKeyString(rateLimiterInput),
      "userId1024IPAddr127.0.0.1")
  }
);

function createTempConnectionHandle(id, clientIP) {
  return {
    id: id,
    close: function () {
      self.close();
    },
    onClose: function (fn) {
      var cb = Meteor.bindEnvironment(fn, "connection onClose callback");
      if (self.inQueue) {
        self._closeCallbacks.push(cb);
      } else {
        // if we're already closed, call the callback.
        Meteor.defer(cb);
      }
    },
    clientAddress: clientIP,
    httpHeaders: null
  };
}

function createTempMethodInvocation(userId, connectionHandle, methodName) {
  var methodInv = new DDPCommon.MethodInvocation({
    isSimulation: false,
    userId: userId,
    setUserId: null,
    unblock: false,
    connection: connectionHandle,
    randomSeed: 1234
  });
  methodInv.method = methodName;
  return methodInv;
}