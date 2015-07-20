RATE_LIMIT_NUM_CALLS = 5;
RATE_LIMIT_INTERVAL_TIME_MS = 5000;

Meteor.methods({
  // Adds in a new rule with the specific intervalTime and connectionId as
  // passed in to speed up testing & allow the rule to apply to the connection
  // testing the rate limit.
  addRuleToDDPRateLimiter: function () {
    var connection = this.connection;
    connection.lastRateLimitEvent = connection.lastRateLimitEvent || {};

    this.ruleId = DDPRateLimiter.addRule({
      userId: function (userId) {
        connection.lastRateLimitEvent.userId = type;
        return true;
      },
      type: function (type) {
        connection.lastRateLimitEvent.type = type;
        return true;
      },
      name: function (name) {
        connection.lastRateLimitEvent.name = name;
        return name !== "a-method-that-is-not-rate-limited";
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
  removeUsersByUsername: function (username) {
    Meteor.users.remove({username: username});
  },
  dummy: function () {
    return "yup";
  }
});