import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';
import { RATE_LIMIT_NUM_CALLS, RATE_LIMIT_INTERVAL_TIME_MS } from './ddp-rate-limiter-tests-common';

Meteor.methods({
  // Adds in a new rule with the specific intervalTime and connectionId as
  // passed in to speed up testing & allow the rule to apply to the connection
  // testing the rate limit.
  addRuleToDDPRateLimiter() {
    const connection = this.connection;
    connection.lastRateLimitEvent = connection.lastRateLimitEvent || {};
    connection.lastMethodName = connection.lastMethodName || '';
    // XXX In Javascript v8 engine, we are currently guaranteed the ordering of
    // the keys in objects as they are listed. This may change in future
    // iterations of v8 for performance reasons and will potentially break this
    // test.
    //
    // This is important because we use `connection.lastMethodName` to
    // ignore the 'getLastRateLimitEvent' method so that it can return
    // the actual last rate limit event rather than the one
    // corresponding to the method call to 'getLastRateLimitEvent'.
    this.ruleId = DDPRateLimiter.addRule({
      name(name) {
        connection.lastMethodName = name;
        if (name !== 'getLastRateLimitEvent') {
          connection.lastRateLimitEvent.name = name;
        }
        return name !== 'a-method-that-is-not-rate-limited';
      },
      userId(userId) {
        connection.lastRateLimitEvent.userId = userId;
        return true;
      },
      type(type) {
        // Special check to return proper name since 'getLastRateLimitEvent'
        // is another method call
        if (connection.lastMethodName !== 'getLastRateLimitEvent') {
          connection.lastRateLimitEvent.type = type;
        }
        return true;
      },
      clientAddress(clientAddress) {
        connection.lastRateLimitEvent.clientAddress = clientAddress;
        return true;
      },
      connectionId: this.connection.id,
    }, RATE_LIMIT_NUM_CALLS, RATE_LIMIT_INTERVAL_TIME_MS, (reply, ruleInput) => {
      if (connection.lastMethodName !== 'getLastRateLimitEvent') {
        connection.lastRateLimitEvent.reply = reply;
        connection.lastRateLimitEvent.ruleInput = ruleInput;
      }
    });

    return this.ruleId;
  },
  getLastRateLimitEvent() {
    return this.connection.lastRateLimitEvent;
  },
  // Server side method to remove rule from DDP Rate Limiter
  removeRuleFromDDPRateLimiter(id) {
    return DDPRateLimiter.removeRule(id);
  },
  // Print all the server rules for debugging purposes.
  printCurrentListOfRules() {
    console.log('Current list of rules :', DDPRateLimiter.printRules());
  },
  removeUserByUsername(username) {
    Meteor.users.remove({ username });
  },
  dummyMethod() {
    return 'yup';
  },
  'a-method-that-is-not-rate-limited'() {
    return 'not-rate-limited';
  },
  addDefaultAccountsRateLimitRule() {
    Accounts.addDefaultRateLimit();
  },
  removeDefaultAccountsRateLimitRule() {
    return Accounts.removeDefaultRateLimit();
  },
});

Meteor.publish('testSubscription', () => []);
