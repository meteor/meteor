// Adds a default rate limiting rule to DDPRateLimiter and provides methods to remove it
var Ap = AccountsCommon.prototype;
// Add a default rule of limiting logins to 5 times per 10 seconds by IP address.
// Stores the ruleId to remove it when called
Ap._defaultRateLimiterRuleId = DDPRateLimiter.addRule({
  userId: null,
  ipAddr: function (ipAddr) {
    return true;
  },
  type: 'method',
  name: 'login'
}, 5, 1000);

// Removes default rate limiting rule
Ap.removeDefaultAccountsRateLimitRule = function () {
	return DDPRateLimiter.removeRule(Ap._defaultRateLimiterRuleId);
}
