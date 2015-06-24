// Rate Limiter built into DDP
DDPRateLimiter = {}

DDPRateLimiter.rateLimiter = new RateLimiter();

// Add a default rule of limiting logins to 5 times per 10 seconds by IP address.
// Override using DDPRateLimiter.config
DDPRateLimiter.rateLimiter.addRule({
  userId: null,
  ipAddr: function (ipAddr) {
    return true;
  },
  type: 'method',
  name: 'login'
}, 5, 10000);

// DDPRateLimiter.rateLimiter.addRule( {
//   userId: null,
//   ipAddr: function (ipAddr) {
//     return true;
//   },
//   type: 'sub',
//   name: null
// }, 5, 10000);

DDPRateLimiter.getErrorMessage = function (rateLimitResult) {
  return "Error, too many requests. Please slow down. You must wait " + Math.ceil(
    rateLimitResult.timeToReset / 1000) + " seconds before trying again.";
}

DDPRateLimiter.config = function (rules) {
  DDPRateLimiter.rateLimiter.rules = rules;
};

DDPRateLimiter.addRule = function (rule, numRequests, intervalTime) {
  DDPRateLimiter.rateLimiter.addRule(rule, numRequests, intervalTime);
};