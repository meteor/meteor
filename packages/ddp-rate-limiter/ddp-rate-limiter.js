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
/**
 * @summary Update the error message returned when call is rate limited.
 * @param {string|function} message Function that takes an object with a timeToReset field that specifies the first time a method or subscription call is allowed
 */
DDPRateLimiter.setErrorMessage = function (message) {
  this.errorMessage = message;
}

/**
 * @summary Adds a rule with a number of requests allowed per time interval.
 * @param {object}  rule         Rule should be an object where the keys are one or more of `['userId', 'ipAddr', 'type', 'name'] ` and the values are either `null`, a primitive, or a function that returns true if the rule should apply to the provided input for that key.
 * @param {integer} numRequests  number of requests allowed per time interval. Default = 10.
 * @param {integer} timeInterval time interval in milliseconds after which rule's counters are reset. Default = 1000.
 * @return {string} Returns unique `ruleId` that can be passed to `removeRule`.
 */
DDPRateLimiter.addRule = function (rule, numRequests, timeInterval) {
  return this.rateLimiter.addRule(rule, numRequests, timeInterval);
};

/**
 * @summary Removes the rule with specified id.
 * @param  {string} id 'ruleId' returned from `addRule`
 * @return {boolean}    True if a rule was removed.
 */
DDPRateLimiter.removeRule = function (id) {
  return this.rateLimiter.removeRule(id);
}

DDPRateLimiter._increment = function (input) {
  this.rateLimiter.increment(input);
}

DDPRateLimiter._check = function (input) {
  return this.rateLimiter.check(input);
}