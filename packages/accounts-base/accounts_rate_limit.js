// Adds a default rate limiting rule to DDPRateLimiter and provides methods to remove it
var Ap = AccountsCommon.prototype;
// Add a default rule of limiting logins, creating new users and password reset
// to 5 times per 10 seconds by session.
// Stores the ruleId to provide options to remove the default rule.
Ap._defaultRateLimiterRuleId = DDPRateLimiter.addRule({
  userId: null,
  ipAddr: null,
  type: 'method',
  name: function (name) {
    return _.contains(['login', 'createUser', 'resetPassword',
      'forgotPassword'], name);
  },
  sessionId: function (sessionId) {
    return true;
  }
}, 5, 10000);

// Removes default rate limiting rule
Ap.removeDefaultRateLimit = function () {
  return DDPRateLimiter.removeRule(Ap._defaultRateLimiterRuleId);
}