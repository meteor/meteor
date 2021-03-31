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
import { Meteor } from 'meteor/meteor';
import { RateLimiter } from 'meteor/rate-limit';
import { DDPCommon } from 'meteor/ddp-common';

Tinytest.add('rate limit tests - Check empty constructor creation',
  function (test) {
    const r = new RateLimiter();
    test.equal(r.rules, {});
  },
);

Tinytest.add('rate limit tests - Check single rule with multiple ' +
  'invocations, only 1 that matches',
function (test) {
  const r = new RateLimiter();
  const userIdOne = 1;
  const restrictJustUserIdOneRule = {
    userId: userIdOne,
    IPAddr: null,
    method: null,
  };
  r.addRule(restrictJustUserIdOneRule, 1, 1000);
  const connectionHandle = createTempConnectionHandle(123, '127.0.0.1');
  const methodInvc1 = createTempMethodInvocation(userIdOne, connectionHandle,
    'login');
  const methodInvc2 = createTempMethodInvocation(2, connectionHandle,
    'login');
  for (let i = 0; i < 2; i++) {
    r.increment(methodInvc1);
    r.increment(methodInvc2);
  }
  test.equal(r.check(methodInvc1).allowed, false);
  test.equal(r.check(methodInvc2).allowed, true);
},
);

testAsyncMulti('rate limit tests - Run multiple invocations and wait for one' +
  ' to reset', [
  function (test, expect) {
    this.r = new RateLimiter();
    this.userIdOne = 1;
    this.userIdTwo = 2;
    this.restrictJustUserIdOneRule = {
      userId: this.userIdOne,
      IPAddr: null,
      method: null,
    };
    this.r.addRule(this.restrictJustUserIdOneRule, 1, 500);
    this.connectionHandle = createTempConnectionHandle(123, '127.0.0.1')
    this.methodInvc1 = createTempMethodInvocation(this.userIdOne,
      this.connectionHandle, 'login');
    this.methodInvc2 = createTempMethodInvocation(this.userIdTwo,
      this.connectionHandle, 'login');
    for (let i = 0; i < 2; i++) {
      this.r.increment(this.methodInvc1);
      this.r.increment(this.methodInvc2);
    }
    test.equal(this.r.check(this.methodInvc1).allowed, false);
    test.equal(this.r.check(this.methodInvc2).allowed, true);
    Meteor.setTimeout(expect(function () { }), 1000);
  },
  function (test) {
    for (let i = 0; i < 100; i++) {
      this.r.increment(this.methodInvc2);
    }
    test.equal(this.r.check(this.methodInvc1).allowed, true);
    test.equal(this.r.check(this.methodInvc2).allowed, true);
  },
]);

Tinytest.add('rate limit tests - Check two rules that affect same methodInvc' +
  ' still throw', function (test) {
  const r = new RateLimiter();
  const loginMethodRule = {
    userId: null,
    IPAddr: null,
    method: 'login',
  };
  const onlyLimitEvenUserIdRule = {
    userId: userId => userId % 2 === 0,
    IPAddr: null,
    method: null,
  };
  r.addRule(loginMethodRule, 10, 100);
  r.addRule(onlyLimitEvenUserIdRule, 4, 100);
  const connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
  const methodInvc1 = createTempMethodInvocation(1, connectionHandle,
    'login');
  const methodInvc2 = createTempMethodInvocation(2, connectionHandle,
    'login');
  const methodInvc3 = createTempMethodInvocation(3, connectionHandle,
    'test');
  for (let i = 0; i < 5; i++) {
    r.increment(methodInvc1);
    r.increment(methodInvc2);
    r.increment(methodInvc3);
  }
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
  'invocations', function (test) {
  const r = new RateLimiter();
  const loginMethodRule = {
    userId: null,
    IPAddr: null,
    method: 'login',
  };
  r.addRule(loginMethodRule, 10, 10000);

  const connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
  const methodInvc1 = createTempMethodInvocation(1, connectionHandle,
    'login');
  const methodInvc2 = createTempMethodInvocation(2, connectionHandle,
    'login');

  for (let i = 0; i < 5; i++) {
    r.increment(methodInvc1);
    r.increment(methodInvc2);
  }
  // This throws us over the limit since both increment the login rule
  // counter
  r.increment(methodInvc1);

  test.equal(r.check(methodInvc1).allowed, false);
  test.equal(r.check(methodInvc2).allowed, false);
});

Tinytest.add('rate limit tests - add global rule', function (test) {
  const r = new RateLimiter();
  const globalRule = {
    userId: null,
    IPAddr: null,
    method: null,
  };
  r.addRule(globalRule, 1, 10000);

  const connectionHandle = createTempConnectionHandle(1234, '127.0.0.1');
  const connectionHandle2 = createTempConnectionHandle(1234, '127.0.0.2');

  const methodInvc1 = createTempMethodInvocation(1, connectionHandle,
    'login');
  const methodInvc2 = createTempMethodInvocation(2, connectionHandle2,
    'test');
  const methodInvc3 = createTempMethodInvocation(3, connectionHandle,
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
    const r = new RateLimiter();
    const rule = {
      a: inp => inp % 3 === 0,
      b: 5,
      c: 'hi',
    };
    r.addRule(rule, 1, 10000);
    const input = {
      a: 3,
      b: 5,
    };
    for (let i = 0; i < 5; i++) {
      r.increment(input);
    }
    test.equal(r.check(input).allowed, true);
    const matchingInput = {
      a: 3,
      b: 5,
      c: 'hi',
      d: 1,
    };
    r.increment(matchingInput);
    r.increment(matchingInput);
    // Past limit so should be false
    test.equal(r.check(matchingInput).allowed, false);

    // Add secondary rule and check that longer time is returned when multiple
    // rules limits are hit
    const newRule = {
      a: inp => inp % 3 === 0,
      b: 5,
      c: 'hi',
      d: 1,
    };
    r.addRule(newRule, 1, 10);
    // First rule should still throw while second rule will trigger as well,
    // causing us to return longer time to reset to user
    r.increment(matchingInput);
    r.increment(matchingInput);
    test.equal(r.check(matchingInput).timeToReset > 50, true);
  },
);


/****** Test Our Helper Methods *****/

Tinytest.add('rate limit tests - test matchRule method', function (test) {
  const r = new RateLimiter();
  const globalRule = {
    userId: null,
    IPAddr: null,
    type: null,
    name: null,
  };
  const globalRuleId = r.addRule(globalRule);

  const rateLimiterInput = {
    userId: 1023,
    IPAddr: '127.0.0.1',
    type: 'sub',
    name: 'getSubLists',
  };

  test.equal(r.rules[globalRuleId].match(rateLimiterInput), true);

  const oneNotNullRule = {
    userId: 102,
    IPAddr: null,
    type: null,
    name: null,
  };

  const oneNotNullId = r.addRule(oneNotNullRule);
  test.equal(r.rules[oneNotNullId].match(rateLimiterInput), false);

  oneNotNullRule.userId = 1023;
  test.equal(r.rules[oneNotNullId].match(rateLimiterInput), true);

  const notCompleteInput = {
    userId: 102,
    IPAddr: '127.0.0.1',
  };
  test.equal(r.rules[globalRuleId].match(notCompleteInput), true);
  test.equal(r.rules[oneNotNullId].match(notCompleteInput), false);
});

Tinytest.add('rate limit tests - test generateMethodKey string',
  function (test) {
    const r = new RateLimiter();
    const globalRule = {
      userId: null,
      IPAddr: null,
      type: null,
      name: null,
    };
    const globalRuleId = r.addRule(globalRule);

    const rateLimiterInput = {
      userId: 1023,
      IPAddr: '127.0.0.1',
      type: 'sub',
      name: 'getSubLists',
    };

    test.equal(r.rules[globalRuleId]._generateKeyString(rateLimiterInput), '');
    globalRule.userId = 1023;

    test.equal(r.rules[globalRuleId]._generateKeyString(rateLimiterInput),
      'userId1023');

    const ruleWithFuncs = {
      userId: input => input % 2 === 0,
      IPAddr: null,
      type: null,
    };
    const funcRuleId = r.addRule(ruleWithFuncs);
    test.equal(r.rules[funcRuleId]._generateKeyString(rateLimiterInput), '');
    rateLimiterInput.userId = 1024;
    test.equal(r.rules[funcRuleId]._generateKeyString(rateLimiterInput),
      'userId1024');

    const multipleRules = ruleWithFuncs;
    multipleRules.IPAddr = '127.0.0.1';
    const multipleRuleId = r.addRule(multipleRules);
    test.equal(r.rules[multipleRuleId]._generateKeyString(rateLimiterInput),
      'userId1024IPAddr127.0.0.1');
  },
);

function createTempConnectionHandle(id, clientIP) {
  return {
    id,
    close() {
      this.close();
    },
    onClose(fn) {
      const cb = Meteor.bindEnvironment(fn, 'connection onClose callback');
      if (this.inQueue) {
        this._closeCallbacks.push(cb);
      } else {
        // if we're already closed, call the callback.
        Meteor.defer(cb);
      }
    },
    clientAddress: clientIP,
    httpHeaders: null,
  };
}

function createTempMethodInvocation(userId, connectionHandle, methodName) {
  const methodInv = new DDPCommon.MethodInvocation({
    isSimulation: false,
    userId,
    setUserId: null,
    unblock: false,
    connection: connectionHandle,
    randomSeed: 1234,
  });
  methodInv.method = methodName;
  return methodInv;
}
