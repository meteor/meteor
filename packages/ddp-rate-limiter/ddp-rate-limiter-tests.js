// Test that we do hit the default login rate limit.
// XXX Removed to fix testing as other packages currently hit the default rate
// limit.
testAsyncMulti("ddp rate limiter - default rate limit", [
  function (test, expect) {
    // Add in the default rate limiter rule
    Meteor.call('addDefaultAccountsRateLimitRule');
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    var self = this;

    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.loginWithPassword.bind(Meteor, self.username, 'fakePassword'),
      {
        expectedError: 403,
        expectedResult: undefined,
        expectedRateLimitWillBeHit: true,
        expectedIntervalTimeInMs: 10000
      }
    );
  },
  function (test, expect) {
    Meteor.call("removeUserByUsername", this.username, expect(function () {}));
    // Remove the default rate limiter rule
    Meteor.call('removeDefaultAccountsRateLimitRule');
  }
]);

testAsyncMulti("ddp rate limiter - matchers get passed correct arguments", [
  function (test, expect) {
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    var self = this;
    Meteor.call("addRuleToDDPRateLimiter", expect(function(error, result) {
     self.ruleId = result;
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: true
      }
    );
  },
  function (test, expect) {
    var self = this;
    Meteor.call(
      "getLastRateLimitEvent", expect(function (error, result) {
        test.equal(error, undefined);
        test.equal(result.userId, Meteor.userId());
        test.equal(result.type, "method");
        test.equal(result.name, "dummyMethod");
        test.isNotUndefined(result.clientAddress, "clientAddress is not defined");
      }));
  },
  function (test, expect) {
    Meteor.call("removeUserByUsername", this.username, expect(function () {}));
  },
  function (test, expect) {
    var self = this;
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result,true);
    }));
  }
]);

testAsyncMulti("ddp rate limiter - callbacks get passed correct arguments", [
  function (test, expect) {
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    var self = this;
    Meteor.call("addRuleToDDPRateLimiter", expect(function(error, result) {
     self.ruleId = result;
    }));
  },
  function (test, expect) {
    Meteor.call('dummyMethod', expect(function() {}));
  },
  function (test, expect) {
    var self = this;
    Meteor.call(
      "getLastRateLimitEvent", expect(function (error, result) {
        test.isTrue(result.reply.allowed);
        test.isTrue(result.reply.timeToReset < RATE_LIMIT_INTERVAL_TIME_MS);
        test.equal(result.reply.numInvocationsLeft, 4);

        test.equal(result.ruleInput.userId, Meteor.userId());
        test.equal(result.ruleInput.type, 'method');
        test.equal(result.ruleInput.name, 'dummyMethod');
      }));
  },
  function (test, expect) {
    // Wait for the rule to reset
    Meteor.setTimeout(expect(), RATE_LIMIT_INTERVAL_TIME_MS);
  },
  function (test, expect) {
    // Call RATE_LIMIT_NUM_CALLS + 1 times to make the rule exceed limit and reject the execution
    for (var i = 0; i < RATE_LIMIT_NUM_CALLS + 1; i++) {
      Meteor.call('dummyMethod', expect(function() {}));
    }
  },
  function (test, expect) {
    var self = this;
    Meteor.call(
      "getLastRateLimitEvent", expect(function (error, result) {
        test.isFalse(result.reply.allowed);
        test.isTrue(result.reply.timeToReset < RATE_LIMIT_INTERVAL_TIME_MS);
        test.equal(result.reply.numInvocationsLeft, 0);

        test.equal(result.ruleInput.userId, Meteor.userId());
        test.equal(result.ruleInput.type, 'method');
        test.equal(result.ruleInput.name, 'dummyMethod');
      }));
  },
  function (test, expect) {
    Meteor.call("removeUserByUsername", this.username, expect(function () {}));
  },
  function (test, expect) {
    var self = this;
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result,true);
    }));
  }
]);

testAsyncMulti("ddp rate limiter - we can return with type 'subscription'", [
  function (test, expect) {
    var self = this;
    Meteor.call("addRuleToDDPRateLimiter", expect(
      function(error, result) {
        self.ruleId = result;
      }));
  },
  function (test, expect) {
    Meteor.subscribe('testSubscription');
    Meteor.call('getLastRateLimitEvent', expect(function(error, result){
      test.equal(error, undefined);
      test.equal(result.type, "subscription");
      test.equal(result.name, "testSubscription");
      test.isNotUndefined(result.clientAddress, "clientAddress is not defined");
    }));
  },
  function (test, expect) {
    var self = this;
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result, true);
    }));
  }
]);

testAsyncMulti("ddp rate limiter - rate limits to subscriptions", [
  function (test, expect) {
    var self = this;
    Meteor.call("addRuleToDDPRateLimiter", expect(
      function(error, result) {
        self.ruleId = result;
      })
    );
  },
  function (test, expect) {
    this.doSub = function (cb) {
      Meteor.subscribe('testSubscription', {
        onReady: function () {
          cb(null, true);
        },
        onStop: function (error) {
          cb(error, undefined);
        }
      });
    };

    callFnMultipleTimesThenExpectResult(test, expect, this.doSub,
      {
        expectedError: null,
        expectedResult: true,
        expectedRateLimitWillBeHit: true
      }
    );
  },
  function (test, expect) {
    // After removing rule, subscriptions are no longer rate limited.
    var self = this;
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result,true);
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect, this.doSub,
    {
      expectedError: null,
      expectedResult: true,
      expectedIntervalTimeInMs: false
    });

    callFnMultipleTimesThenExpectResult(test, expect, this.doSub,
    {
      expectedError: null,
      expectedResult: true,
      expectedIntervalTimeInMs: false
    });
  }
]);


// - If you wait 5 seconds you are no longer rate limited
testAsyncMulti("ddp rate limiter - rate limit resets after " +
  "RATE_LIMIT_INTERVAL_TIME_MS", [
  function (test, expect) {
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    var self = this;
    Meteor.call("addRuleToDDPRateLimiter", expect(function(error, result) {
     self.ruleId = result;
    }));
  },

  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: true
      }
    );
  },
  function (test, expect) {
    Meteor.setTimeout(expect(), RATE_LIMIT_INTERVAL_TIME_MS);
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: true
      }
    );
  },
  function (test, expect) {
    var self = this;
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result, true);
    }));
  }
]);

testAsyncMulti("ddp rate limiter - 'a-method-that-is-not-rate-limited' is not" +
  " rate limited", [
  function (test, expect) {
    var self = this;
    Meteor.call('addRuleToDDPRateLimiter', expect(function(error, result){
      self.ruleId = result;
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'a-method-that-is-not-rate-limited'),
      {
        expectedError: undefined,
        expectedResult: "not-rate-limited",
        expectedRateLimitWillBeHit: false
      });
  },
  function (test, expect) {
    var self = this;
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result, true);
    }));
  }
]);

// When we have a rate limited client and we remove the rate limit rule,
// all requests should be allowed immediately afterwards.
testAsyncMulti("ddp rate limiter - test removing rule with rateLimited " +
  "client lets them send new queries", [
  function (test, expect) {
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    var self = this;
    Meteor.call("addRuleToDDPRateLimiter", expect(function(error, result) {
     self.ruleId = result;
    }));
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    var self = this;
    // By removing the rule from the DDP rate limiter, we no longer restrict
    // them even though they were rate limited
    Meteor.call('removeRuleFromDDPRateLimiter', self.ruleId,
      expect(function(error, result) {
        test.equal(result,true);
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: false
      }
    );

    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: false
      }
    );
  },
  function (test, expect) {
    Meteor.call("removeUserByUsername", this.username, expect(function () {}));
  }
]);

function createTestUser(test, expect) {
  const username = Random.id();
  const email = Random.id() + '-intercept@example.com';
  const password = 'password';

  Accounts.createUser({
    username: username,
    email: email,
    password: password
  },
  expect(function (error, result) {
    test.equal(error, undefined);
    test.notEqual(Meteor.userId(), null);
  }));

  return {username, email, password};
};

/**
 * A utility function that runs an arbitrary JavaScript function with a single
 * Node-style callback argument multiple times, verifying that the callback is
 * fired with certain arguments; then run the function one more time,
 * conditionally verifying that the callback is now fired with the "too-many-
 * request" rate limit error.
 *
 * @param             test                       As in testAsyncMulti
 * @param             expect                     As in testAsyncMulti
 * @param  {Function} fn                         [description]
 * @param             expectedError              expected error before hitting
 *                                               rate limit
 * @param             expectedResult             result expected before hitting
 *                                               rate limit
 * @param  {boolean}   expectedRateLimitWillBeHit Should we hit rate limit
 */
function callFnMultipleTimesThenExpectResult(
  test, expect, fn, {expectedError, expectedResult, expectedRateLimitWillBeHit,
  expectedIntervalTimeInMs}) {

  for (var i = 0; i < RATE_LIMIT_NUM_CALLS; i++) {
    fn(expect(function (error, result) {
      test.equal(error && error.error, expectedError);
      test.equal(result, expectedResult);
    }));
  }

  fn(expect(function (error, result) {
    if (expectedRateLimitWillBeHit) {
      test.equal(error && error.error, 'too-many-requests', 'error : ' + error);
      test.isTrue(error &&  error.details.timeToReset <
        expectedIntervalTimeInMs || RATE_LIMIT_INTERVAL_TIME_MS, 'too long');
      test.equal(result, undefined, 'result is not undefined');
    } else {
      test.equal(error && error.error, expectedError);
      test.equal(result, expectedResult);
    }
  }));
}
