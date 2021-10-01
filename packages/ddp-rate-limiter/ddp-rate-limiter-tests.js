import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';
import { Accounts } from 'meteor/accounts-base';
import { RATE_LIMIT_NUM_CALLS, RATE_LIMIT_INTERVAL_TIME_MS } from './ddp-rate-limiter-tests-common';

// Test that we do hit the default login rate limit.
// XXX Removed to fix testing as other packages currently hit the default rate
// limit.

testAsyncMulti('ddp rate limiter - default rate limit', [
  function (test, expect) {
    // Add in the default rate limiter rule
    Meteor.call('addDefaultAccountsRateLimitRule');
    Object.assign(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.loginWithPassword.bind(Meteor, this.username, 'fakePassword'),
      {
        expectedError: 403,
        expectedResult: undefined,
        expectedRateLimitWillBeHit: true,
        expectedIntervalTimeInMs: 10000,
      },
    );
  },
  function (test, expect) {
    Meteor.call('removeUserByUsername', this.username, expect(() => {}));
    // Remove the default rate limiter rule
    Meteor.call('removeDefaultAccountsRateLimitRule');
  },
]);

testAsyncMulti('ddp rate limiter - matchers get passed correct arguments', [
  function (test, expect) {
    Object.assign(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect((error, result) => {
      this.ruleId = result;
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: 'yup',
        expectedRateLimitWillBeHit: true,
      },
    );
  },
  function (test, expect) {
    Meteor.call(
      'getLastRateLimitEvent', expect((error, result) => {
        test.equal(error, undefined);
        test.equal(result.userId, Meteor.userId());
        test.equal(result.type, 'method');
        test.equal(result.name, 'dummyMethod');
        test.isNotUndefined(result.clientAddress, 'clientAddress is not defined');
      }));
  },
  function (test, expect) {
    Meteor.call('removeUserByUsername', this.username, expect(() => {}));
  },
  function (test, expect) {
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
]);

testAsyncMulti('ddp rate limiter - callbacks get passed correct arguments', [
  function (test, expect) {
    Object.assign(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect((error, result) => {
      this.ruleId = result;
    }));
  },
  function (test, expect) {
    Meteor.call('dummyMethod', expect(() => {}));
  },
  function (test, expect) {
    Meteor.call(
      'getLastRateLimitEvent',
      expect((error, result) => {
        test.isTrue(result.reply.allowed);
        test.isTrue(result.reply.timeToReset < RATE_LIMIT_INTERVAL_TIME_MS + 100);
        test.equal(result.reply.numInvocationsLeft, 4);

        test.equal(result.ruleInput.userId, Meteor.userId());
        test.equal(result.ruleInput.type, 'method');
        test.equal(result.ruleInput.name, 'dummyMethod');
      }),
    );
  },
  function (test, expect) {
    // Wait for the rule to reset
    Meteor.setTimeout(expect(), RATE_LIMIT_INTERVAL_TIME_MS);
  },
  function (test, expect) {
    // Call RATE_LIMIT_NUM_CALLS + 1 times to make the rule exceed limit and reject the execution
    for (let i = 0; i < RATE_LIMIT_NUM_CALLS + 1; i++) {
      Meteor.call('dummyMethod', expect(() => {}));
    }
  },
  function (test, expect) {
    Meteor.call('getLastRateLimitEvent', expect((error, result) => {
      test.isFalse(result.reply.allowed);
      test.isTrue(result.reply.timeToReset < RATE_LIMIT_INTERVAL_TIME_MS + 100);
      test.equal(result.reply.numInvocationsLeft, 0);

      test.equal(result.ruleInput.userId, Meteor.userId());
      test.equal(result.ruleInput.type, 'method');
      test.equal(result.ruleInput.name, 'dummyMethod');
    }));
  },
  function (test, expect) {
    Meteor.call('removeUserByUsername', this.username, expect(() => {}));
  },
  function (test, expect) {
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
]);

testAsyncMulti('ddp rate limiter - we can return with type \'subscription\'', [
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect(
      (error, result) => {
        this.ruleId = result;
      }));
  },
  function (test, expect) {
    Meteor.subscribe('testSubscription');
    Meteor.call('getLastRateLimitEvent', expect((error, result) =>{
      test.equal(error, undefined);
      test.equal(result.type, 'subscription');
      test.equal(result.name, 'testSubscription');
      test.isNotUndefined(result.clientAddress, 'clientAddress is not defined');
    }));
  },
  function (test, expect) {
    // Cleanup
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
]);

testAsyncMulti('ddp rate limiter - rate limits to subscriptions', [
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect((error, result) => {
      this.ruleId = result;
    }));
  },
  function (test, expect) {
    this.doSub = (cb) => {
      Meteor.subscribe('testSubscription', {
        onReady() {
          cb(null, true);
        },
        onStop(error) {
          cb(error, undefined);
        },
      });
    };

    callFnMultipleTimesThenExpectResult(test, expect, this.doSub,
      {
        expectedError: null,
        expectedResult: true,
        expectedRateLimitWillBeHit: true,
      },
    );
  },
  function (test, expect) {
    // After removing rule, subscriptions are no longer rate limited.
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect, this.doSub,
      {
        expectedError: null,
        expectedResult: true,
        expectedIntervalTimeInMs: false,
      },
    );

    callFnMultipleTimesThenExpectResult(test, expect, this.doSub,
      {
        expectedError: null,
        expectedResult: true,
        expectedIntervalTimeInMs: false,
      },
    );
  },
]);


// - If you wait 5 seconds you are no longer rate limited
testAsyncMulti('ddp rate limiter - rate limit resets after ' +
  'RATE_LIMIT_INTERVAL_TIME_MS', [
  function (test, expect) {
    Object.assign(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect((error, result) => {
      this.ruleId = result;
    }));
  },

  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: 'yup',
        expectedRateLimitWillBeHit: true,
      },
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
        expectedResult: 'yup',
        expectedRateLimitWillBeHit: true,
      },
    );
  },
  function (test, expect) {
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
]);

testAsyncMulti('ddp rate limiter - \'a-method-that-is-not-rate-limited\' is not' +
  ' rate limited', [
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect((error, result) =>{
      this.ruleId = result;
    }));
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'a-method-that-is-not-rate-limited'),
      {
        expectedError: undefined,
        expectedResult: 'not-rate-limited',
        expectedRateLimitWillBeHit: false,
      },
    );
  },
  function (test, expect) {
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
]);

// When we have a rate limited client and we remove the rate limit rule,
// all requests should be allowed immediately afterwards.
testAsyncMulti('ddp rate limiter - test removing rule with rateLimited ' +
  'client lets them send new queries', [
  function (test, expect) {
    Object.assign(this, createTestUser(test, expect));
  },
  function (test, expect) {
    Meteor.call('addRuleToDDPRateLimiter', expect((error, result) => {
      this.ruleId = result;
    }));
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    // By removing the rule from the DDP rate limiter, we no longer restrict
    // them even though they were rate limited
    Meteor.call('removeRuleFromDDPRateLimiter', this.ruleId,
      expect((error, result) => {
        test.equal(result, true);
      }),
    );
  },
  function (test, expect) {
    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: 'yup',
        expectedRateLimitWillBeHit: false,
      },
    );

    callFnMultipleTimesThenExpectResult(test, expect,
      Meteor.call.bind(Meteor, 'dummyMethod'),
      {
        expectedError: undefined,
        expectedResult: 'yup',
        expectedRateLimitWillBeHit: false,
      },
    );
  },
  function (test, expect) {
    Meteor.call('removeUserByUsername', this.username, expect(function () {}));
  },
]);

function createTestUser(test, expect) {
  const username = Random.id();
  const email = `${Random.id()}-intercept@example.com`;
  const password = 'password';

  Accounts.createUser(
    {
      username,
      email,
      password,
    },
    expect((error) => {
      test.equal(error, undefined);
      test.notEqual(Meteor.userId(), null);
    }),
  );

  return { username, email, password };
}

/**
 * A utility function that runs an arbitrary JavaScript function with a single
 * Node-style callback argument multiple times, verifying that the callback is
 * fired with certain arguments; then run the function one more time,
 * conditionally verifying that the callback is now fired with the 'too-many-
 * request' rate limit error.
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
  test,
  expect,
  fn,
  {
    expectedError,
    expectedResult,
    expectedRateLimitWillBeHit,
    expectedIntervalTimeInMs,
  },
) {
  for (let i = 0; i < RATE_LIMIT_NUM_CALLS; i++) {
    fn(expect((error, result) => {
      test.equal(error && error.error, expectedError);
      test.equal(result, expectedResult);
    }));
  }

  fn(expect((error, result) => {
    if (expectedRateLimitWillBeHit) {
      test.equal(error && error.error, 'too-many-requests', `error : ${error}`);
      test.isTrue((error && error.details.timeToReset <
        expectedIntervalTimeInMs) || RATE_LIMIT_INTERVAL_TIME_MS, 'too long');
      test.equal(result, undefined, 'result is not undefined');
    } else {
      test.equal(error && error.error, expectedError);
      test.equal(result, expectedResult);
    }
  }));
}
