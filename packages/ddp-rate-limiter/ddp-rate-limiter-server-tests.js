Meteor.methods({
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

	removeRuleFromDDPRateLimiter : function(id) {
    return DDPRateLimiter.removeRule(id);
	},

	printCurrentListOfRules : function () {
		console.log('Current list of rules :', DDPRateLimiter.rateLimiter.rules);
	}
});

Tinytest.add("Test rule gets added and removed from Accounts_base", function(test) {
	// Test that DDPRateLimiter rules is not empty
	test.notEqual(DDPRateLimiter.rateLimiter.rules, {});

	Accounts.removeDefaultRateLimit();
	// Test DDPRateLimiter rules is empty after removing only rule
	test.equal(DDPRateLimiter.rateLimiter.rules, {});
});
