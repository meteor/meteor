// Write your package code here!
DDPRateLimiter = {}

DDPRateLimiter.RateLimiter = new RateLimiter();
// Add a default rule of limiting logins to 5 times per 10 seconds by IP address. Override using DDPRateLimiter.config

DDPRateLimiter.addRule({ userId: null, IPAddr : function (IPAddr) { 
	return true }, method: 'login'}, 5, 10000);

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