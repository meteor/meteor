// Rate Limiter built into DDP with a default error message.
DDPRateLimiter = {
  errorMessage : function (rateLimitResult) {
    return "Error, too many requests. Please slow down. You must wait " + Math.ceil(
    rateLimitResult.timeToReset / 1000) + " seconds before trying again.";
  }
}

DDPRateLimiter.rateLimiter = new RateLimiter();

// DDPRateLimiter.rateLimiter.addRule( {
//   userId: null,
//   ipAddr: function (ipAddr) {
//     return true;
//   },
//   type: 'sub',
//   name: null
// }, 5, 10000);

DDPRateLimiter.getErrorMessage = function (rateLimitResult) {
  if (typeof this.errorMessage === 'function')
    return this.errorMessage(rateLimitResult);
  else
    return this.errorMessage;
}

DDPRateLimiter.setErrorMessage = function (message) {
  this.errorMessage = message;
}

DDPRateLimiter.setRules = function (rules) {
  DDPRateLimiter.rateLimiter.rules = rules;
};

DDPRateLimiter.addRule = function (rule, numRequests, intervalTime) {
  DDPRateLimiter.rateLimiter.addRule(rule, numRequests, intervalTime);
};


// Add a default rule of limiting logins to 5 times per 10 seconds by IP address.
// Override using DDPRateLimiter.config
DDPRateLimiter.addRule({
  userId: null,
  ipAddr: function (ipAddr) {
    return true;
  },
  type: 'method',
  name: 'login'
}, 5, 10000);
