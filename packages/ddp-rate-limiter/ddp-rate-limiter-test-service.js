Meteor.methods({
  // Adds in a new rule with the specific intervalTime and connectionId as
  // passed in to speed up testing & allow the rule to apply to the connection
  // testing the rate limit.
  addRuleToDDPRateLimiter: function () {
    var connection = this.connection;
    connection.lastRateLimitEvent = connection.lastRateLimitEvent || {};
    connection.lastMethodName = connection.lastMethodName || '';
    this.ruleId = DDPRateLimiter.addRule({
      userId: function (userId) {
        connection.lastRateLimitEvent.userId = userId;
        return true;
      },
      type: function (type) {
        // Special check to return proper name since 'getLastRateLimitEvent'
        // is another method call
        if (connection.lastMethodName !== 'getLastRateLimitEvent'){
          connection.lastRateLimitEvent.type = type;
        }
        return true;
      },
      name: function (name) {
        if (name !== 'getLastRateLimitEvent') {
          connection.lastRateLimitEvent.name = name;
        }
        connection.lastMethodName = name;
        return name !== "a-method-that-is-not-rate-limited";
      },
      clientAddress: function (clientAddress) {
        connection.lastRateLimitEvent.clientAddress = clientAddress
        return true;
      },
      connectionId: this.connection.id
    }, RATE_LIMIT_NUM_CALLS, RATE_LIMIT_INTERVAL_TIME_MS);

    return this.ruleId;
  },
  getLastRateLimitEvent: function () {
    return this.connection.lastRateLimitEvent;
  },
  // Server side method to remove rule from DDP Rate Limiter
  removeRuleFromDDPRateLimiter: function (id) {
    return DDPRateLimiter.removeRule(id);
  },
  // Print all the server rules for debugging purposes.
  printCurrentListOfRules: function () {
    console.log('Current list of rules :', DDPRateLimiter.printRules());
  },
  removeUserByUsername: function (username) {
    Meteor.users.remove({username: username});
  },
  dummyMethod: function () {
    return "yup";
  },
  'a-method-that-is-not-rate-limited': function () {
    return "not-rate-limited";
  },
  addSubscriptionRuleToDDPRateLimiter: function () {
    var connection = this.connection;
    connection.lastRateLimitEvent = connection.lastRateLimitEvent || {};
    connection.lastMethodName = connection.lastMethodName || '';
    this.ruleId = DDPRateLimiter.addRule({
      userId: function (userId) {
        connection.lastRateLimitEvent.userId = userId;
        return true;
      },
      name: function (name) {
        connection.lastMethodName = name;
        // Special check to return proper name since 'getLastRateLimitEvent'
        // is another method call
        if (name !== 'getLastRateLimitEvent')
          connection.lastRateLimitEvent.name = name;
        return true;
      },
      type: function (type) {
        if (connection.lastMethodName !== 'getLastRateLimitEvent')
          connection.lastRateLimitEvent.type = type;
        return type === 'subscription';
      },
      clientAddress: function (clientAddress) {
        connection.lastRateLimitEvent.clientAddress = clientAddress;
        return true;
      },
      connectionId: this.connection.id
    }, RATE_LIMIT_NUM_CALLS, RATE_LIMIT_INTERVAL_TIME_MS);
    return this.ruleId;
  }
});

Meteor.publish("testSubscription", function () {
  return [];
});
