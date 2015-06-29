// Adds a default rate limiting rule to DDPRateLimiter and provides methods to remove it
var Ap = AccountsCommon.prototype;
// Add a default rule of limiting logins, creating new users and password reset
// to 5 times per 10 seconds by IP address.
// Stores the ruleId to provide option to remove the default rule.
Ap._defaultRateLimiterRuleId = DDPRateLimiter.addRule({
  userId: null,
  ipAddr: function (ipAddr) {
    return true;
  },
  type: 'method',
  name: function(name) {
		return _.has(['login', 'createUser', 'resetPassword']);
  }
}, 5, 10000);

// Removes default rate limiting rule
Ap.removeDefaultRateLimit = function () {
	return DDPRateLimiter.removeRule(Ap._defaultRateLimiterRuleId);
}