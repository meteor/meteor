// Write your package code here!
DDPRateLimiter = {}

DDPRateLimiter.RateLimiter = new RateLimiter();
DDPRateLimiter.ErrorMessage = function (rateLimitResult) {
	return "Error, too many requests. Please slow down. You must wait " 
            + Math.ceil(rateLimitResult.timeToReset / 1000) + " seconds before trying again.";
        }

DDPRateLimiter.config = function (rules) {
	DDPRateLimiter.RateLimiter.rules = rules;
};

DDPRateLimiter.addRule = function (rule, numRequests, intervalTime) {
	DDPRateLimiter.RateLimiter.addRule(rule, numRequests, intervalTime);
};

DDPRateLimiter.setErrorMessage = function (message) {
	DDPRateLimiter.ErrorMessage = message;
}