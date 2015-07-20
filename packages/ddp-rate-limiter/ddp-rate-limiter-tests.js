// Test that we do hit the default login rate limit.
testAsyncMulti("ddp rate limiting - default rate limit", [
  function (test, expect) {
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
        expectedRateLimitWillBeHit: true
      }
    });
  },
  function (test, expect) {
    Meteor.call("removeUserByUsername", this.username, expect());
  }
]);

testAsyncMulti("ddp rate limiting - matchers XCXC get passed correct arguments", [
  function (test, expect) {
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.call("addRuleToDDPRateLimiter", expect());
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: true
      }
    });
  },
  function (test, expect) {
    Meteor.call(
      "getLatestRateLimiterEvent", expect(function (error, result) {
        test.equal(error, undefined);
        test.equal(result.userId, Meteor.userId());
        test.equal(result.type, "method");
        test.equal(result.name, "dummyMethod");
      }));
  }
  function (test, expect) {
    Meteor.call("removeUserByUsername", this.username, expect());
  }
]);
/// XXCS Rebase devel into my branch
// Still need to be tested:
// - getLatestRateLimiterEvent returns something with type: "subscription"
// - If you wait 5 seconds you are no longer rate limited
// - subscriptions are also rate limited
// - "a-method-that-is-not-rate-limited" is not rate limited


// When we have a rate limited client and we remove the rate limit rule,
// all requests should be allowed immediately afterwards.
testAsyncMulti("test removing rule with rateLimited client lets them send " +
  "new queries", [
  function(test, expect) {
    var self = this;

   function (test, expect) {
    _.extend(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.call("addRuleToDDPRateLimiter", expect());
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
    });

    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: "yup",
        expectedRateLimitWillBeHit: false
      }
    });
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
 * @param  {[type]}   expectedError              [description]
 * @param  {[type]}   expectedResult             [description]
 * @param  {[type]}   expectedRateLimitWillBeHit [description]
 * @return {[type]}                              [description]
 */
function callFnMultipleTimesThenExpectResult(
  test, expect, fn, {expectedError, expectedResult, expectedRateLimitWillBeHit}) {
  for (var i = 0; i < RATE_LIMIT_NUM_CALLS; i++) {
    fn(expect(function (error, result) {
      test.equal(error && error.error, expectedError);
      test.equal(result, expectedResult);
    }));
  }

  fn(expect(function (error, result) {
    if (expectedRateLimitWillBeHit) {
      test.equal(error && error.error, 'too-many-requests');
      test.isTrue(error.details.timeToReset < RATE_LIMIT_INTERVAL_TIME_MS);
      test.equal(result, undefined);
    } else {
      test.equal(error && error.error, expectedError);
      test.equal(result, expectedResult);
    }
  }));
}



// Rules that have matchers on every field must match right fields correctly. Add a rule with matchers on every field,
/*
So, here's an idea for how to do it:
Add a rule with functions for each of the following properties: userId, clientAddress (should be renamed from ipAddr, type, name, sessionId)

The rule can simply be "userId must be not-null", but it should inspect all of the properties. Now check this out: The matcher function sets the values it gets in these functions on an object that's stored on the connection object. So, once you call a method or start a subscription your server code can just inspect that object to see what values were passed. Then you can write a new method to return that object (since the connection object will be the same). You end up with a test that looks something like this:

add the rule i just described
create user
call a method you define that does nothing, say "dummyDoNothing". verify that the method executed, then call the method called "getLatestRateLimiterEventObject".
call a new method you write called "getExpectedRateLimiterEventObjectForMethod". this method should return an custom-created object with "userId", "clientAddress", etc based on this.connection.
verify that what you got from "getLatestRateLimiterEventObject" is the same as what you got from "getExpectedRateLimiterEventObjectForMethod".
Then call the method a few more times until you hit the rate limit (you can make it happen after 5 attempts for THIS CONNECTION ONLY). verify that you hit the rate limit.
then log out
run the comparison between the results of "getLatestRateLimiterEventObject" and "getExpectedRateLimiterEventObjectForMethod" again. (since now we're not logged in it's worth verifying this case specifically)
Now, start a subscription named "dummySubscriptionForRateLimitTest" that just returns []. We do this to verify that we set the value "subscription" correctly on the event object passed in to the rule matcher
Compare the results of "getLatestRateLimiterEventObject" and "getExpectedRateLimiterEventObjectForSubscription" -- NOTE that you need two different "expected event object" methods, one for methods and one for subscriptions. Do not just pass in "method" and "subcription" as arguments to the same method and place that on this.connection.lastEventObject.type since then you wouldn't be testing the value of that property!

In case you find this weird, that we're duplicating logic between the code and the test and making us have to change two places in our code instead of one if we change anything about the behavior of DDPRateLimiter -- that's GOOD! It will be much easier to change this test than change the code, and if you are changing the code intentionally it's good to force you to acknowledge "oh, right! i did mean to change this in that way." But if you're changing the code and unintentionally changed the behavior, then this test will make sure you catch it.
*/



