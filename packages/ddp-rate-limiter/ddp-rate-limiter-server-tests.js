Meteor.methods({
  resetAndAddRuleToDDPRateLimiter : function(intervalTimeInMillis) {
    DDPRateLimiter.rateLimiter.rules = {};
      this.ruleId = DDPRateLimiter.addRule({
        userId: null,
        ipAddr: function() {return true},
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