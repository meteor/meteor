Meteor.methods({
  // Resets the DDPRateLimiter and removes all rules. Adds in a new rule with
  // the specific intervalTime as passed in to speed up testing.
  resetAndAddRuleToDDPRateLimiter : function(intervalTimeInMillis) {
    DDPRateLimiter.rateLimiter.rules = {};
      this.ruleId = DDPRateLimiter.addRule({
        userId: null,
        ipAddr: function() {
          return true;
        },
        type: 'method',
        name: 'login'
      }, 5, intervalTimeInMillis);
     return this.ruleId;
  },
  // Server side method to remove rule from DDP Rate Limiter
  removeRuleFromDDPRateLimiter : function(id) {
    return DDPRateLimiter.removeRule(id);
  },
  // Print all the server rules for debugging purposes.
  printCurrentListOfRules : function () {
    console.log('Current list of rules :', DDPRateLimiter.rateLimiter.rules);
  }
});