// Rate Limiter built into DDP with a default error message.
DDPRateLimiter = {
  errorMessage : function (rateLimitResult) {
    return "Error, too many requests. Please slow down. You must wait " + Math.ceil(
    rateLimitResult.timeToReset / 1000) + " seconds before trying again.";
  },
  rateLimiter : new RateLimiter()
}

DDPRateLimiter.getErrorMessage = function (rateLimitResult) {
  if (typeof this.errorMessage === 'function')
    return this.errorMessage(rateLimitResult);
  else
    return this.errorMessage;
}

DDPRateLimiter.setErrorMessage = function (message) {
  this.errorMessage = message;
}

DDPRateLimiter.addRule = function (rule, numRequests, intervalTime) {
  return DDPRateLimiter.rateLimiter.addRule(rule, numRequests, intervalTime);
};

DDPRateLimiter.removeRule = function (id) {
  return DDPRateLimiter.rateLimiter.removeRule(id);
}