Tinytest.add("Test rule gets added and removed from Accounts_base", function(test) {
	// Test that DDPRateLimiter rules is not empty
	test.notEqual(DDPRateLimiter.rateLimiter.rules, {});

	Accounts.removeDefaultRateLimit();
	// Test DDPRateLimiter rules is empty after removing only rule
	test.equal(DDPRateLimiter.rateLimiter.rules, {});
});
