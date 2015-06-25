Tinytest.add('Check empty constructor creation', function (test) {
  r = new RateLimiter();
  test.equal(r.rules, {});
});

Tinytest.add(
  'Check single rule with multiple invocations, only 1 that matches',
  function (test) {
    r = new RateLimiter();
    var myUserId = 1;
    var rule1 = {
      userId: myUserId,
      IPAddr: null,
      method: null
    };

    r.addRule(rule1, 1, 1000);
    var connectionHandle = createTempConnectionHandle(123, '127.0.0.1');
    var methodInvc1 = createTempMethodInvocation(myUserId, connectionHandle,
      'login');
    var methodInvc2 = createTempMethodInvocation(2, connectionHandle,
      'login');
    for (var i = 0; i < 2; i++) {
      r.increment(methodInvc1);
      r.increment(methodInvc2);
    }
    test.equal(r.check(methodInvc1).valid, false);
    test.equal(r.check(methodInvc2).valid, true);
  });

testAsyncMulti("Run multiple invocations and wait for one to return", [
  function (test, expect) {
    var self = this;
    self.r = new RateLimiter();
    self.myUserId = 1;
    self.rule1 = {
      userId: self.myUserId,
      IPAddr: null,
      method: null
    };
    self.r.addRule(self.rule1, 1, 1000);
    self.connectionHandle = createTempConnectionHandle(123, '127.0.0.1')
    self.methodInvc1 = createTempMethodInvocation(self.myUserId, self.connectionHandle,
      'login');
    self.methodInvc2 = createTempMethodInvocation(2, self.connectionHandle,
      'login');
    for (var i = 0; i < 2; i++) {
      self.r.increment(self.methodInvc1);
      self.r.increment(self.methodInvc2);
    }
    test.equal(self.r.check(self.methodInvc1).valid, false);
    test.equal(self.r.check(self.methodInvc2).valid, true);
    Meteor.setTimeout(expect(function () {}), 1000);
  },
  function (test, expect) {
    var self = this;
    for (var i = 0; i < 100; i++) {
      self.r.increment(self.methodInvc2);
    }

    test.equal(self.r.check(self.methodInvc1).valid, true);
    test.equal(self.r.check(self.methodInvc2).valid, true);
  }
]);

Tinytest.add('Check two rules that affect same methodInvc still throw',
  function (test) {
    r = new RateLimiter();
    var loginRule = {
      userId: null,
      IPAddr: null,
      method: 'login'
    };
    var userIdRule = {
      userId: function (userId) {
        return userId % 2 === 0
      },
      IPAddr: null,
      method: null
    };
    r.addRule(loginRule, 10, 100);
    r.addRule(userIdRule, 4, 100);

    var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
    var methodInvc1 = createTempMethodInvocation(1, connectionHandle,
      'login');
    var methodInvc2 = createTempMethodInvocation(2, connectionHandle,
      'login');
    var methodInvc3 = createTempMethodInvocation(3, connectionHandle, 'test');

    for (var i = 0; i < 5; i++) {
      r.increment(methodInvc1);
      r.increment(methodInvc2);
      r.increment(methodInvc3);
    };

    // After for loop runs, we only have 10 runs, so that's under the limit
    test.equal(r.check(methodInvc1).valid, true);
    // However, this triggers userId rule since this userId is even
    test.equal(r.check(methodInvc2).valid, false);
    test.equal(r.check(methodInvc2).valid, false);

    // Running one more test causes it to be false, since we're at 11 now.
    r.increment(methodInvc1);
    test.equal(r.check(methodInvc1).valid, false);
    test.equal(r.check(methodInvc3).valid, true);

  });

Tinytest.add('Check two rules that are affected by different invocations',
  function (test) {
    r = new RateLimiter();
    var loginRule = {
      userId: null,
      IPAddr: null,
      method: 'login'
    }
    r.addRule(loginRule, 10, 10000);

    var connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
    var methodInvc1 = createTempMethodInvocation(1, connectionHandle,
      'login');
    var methodInvc2 = createTempMethodInvocation(2, connectionHandle,
      'login');

    for (var i = 0; i < 5; i++) {
      r.increment(methodInvc1);
      r.increment(methodInvc2);
    }
    r.increment(methodInvc1);

    test.equal(r.check(methodInvc1).valid, false);
    test.equal(r.check(methodInvc2).valid, false);
  });

Tinytest.add("add global rule", function (test) {
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

  r.increment(methodInvc2);
  test.equal(r.check(methodInvc1).valid, true);
  test.equal(r.check(methodInvc2).valid, true);
  test.equal(r.check(methodInvc3).valid, true);
  r.increment(methodInvc3);
  test.equal(r.check(methodInvc1).valid, false);
  test.equal(r.check(methodInvc2).valid, false);
  test.equal(r.check(methodInvc3).valid, false);
});

Tinytest.add('add fuzzy rule match doesnt trigger', function (test) {
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
  test.equal(r.check(input).valid, true);
  var matchingInput = {
    a: 3,
    b: 5,
    c: "hi",
    d: 1
  }
  r.increment(matchingInput);
  r.increment(matchingInput);
  // Past limit so should be false
  test.equal(r.check(matchingInput).valid, false);


  // Add secondary rule and check that longer time is returned when multiple rules limits are hit
  var newRule = {
    a: function (inp) {
      return inp % 3 == 0
    },
    b: 5,
    c: "hi",
    d: 1
  }
  r.addRule(newRule, 1, 10);
  // First rule should still throw while second rule will trigger as well, causing us to return
  // longer time to reset to user
  r.increment(matchingInput);
  r.increment(matchingInput);
  test.equal(r.check(matchingInput).timeToReset > 50, true);
});


/****** Test Helper Methods *****/

Tinytest.add("test matchRule method", function (test) {
  r = new RateLimiter();
  var globalRule = {
    userId: null,
    IPAddr: null,
    type: null,
    name: null
  }
  var globalRuleId = r.addRule(globalRule);

  var RateLimiterInput = {
    userId: 1023,
    IPAddr: "127.0.0.1",
    type: 'sub',
    name: 'getSubLists'
  };

  test.equal(r.rules[globalRuleId].match(RateLimiterInput), true);

  var oneNotNullRule = {
    userId: 102,
    IPAddr: null,
    type: null,
    name: null
  }

  var oneNotId = r.addRule(oneNotNullRule);
  test.equal(r.rules[oneNotId].match(RateLimiterInput), false);

  oneNotNullRule.userId = 1023;
  test.equal(r.rules[oneNotId].match(RateLimiterInput), true);

  var notCompleteInput = {
    userId: 102,
    IPAddr: '127.0.0.1'
  };
  test.equal(r.rules[globalRuleId].match(notCompleteInput), true);
  test.equal(r.rules[oneNotId].match(notCompleteInput), false);
});

Tinytest.add('test generateMethodKey string', function (test) {
  r = new RateLimiter();
  var globalRule = {
    userId: null,
    IPAddr: null,
    type: null,
    name: null
  }
  var globalRuleId = r.addRule(globalRule);

  var RateLimiterInput = {
    userId: 1023,
    IPAddr: "127.0.0.1",
    type: 'sub',
    name: 'getSubLists'
  };

  test.equal(r.rules[globalRuleId]._generateKeyString(RateLimiterInput), "");
  globalRule.userId = 1023;

  test.equal(r.rules[globalRuleId]._generateKeyString(RateLimiterInput),
    "userId1023");

  var ruleWithFuncs = {
    userId: function (input) {
      return input % 2 === 0
    },
    IPAddr: null,
    type: null
  };
  var funcRuleId = r.addRule(ruleWithFuncs);
  test.equal(r.rules[funcRuleId]._generateKeyString(RateLimiterInput), "");
  RateLimiterInput.userId = 1024;
  test.equal(r.rules[funcRuleId]._generateKeyString(RateLimiterInput),
    "userId1024");

  var multipleRules = ruleWithFuncs;
  multipleRules.IPAddr = '127.0.0.1';
  var multipleRuleId = r.addRule(multipleRules);
  test.equal(r.rules[multipleRuleId]._generateKeyString(RateLimiterInput),
    "userId1024IPAddr127.0.0.1")
})

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