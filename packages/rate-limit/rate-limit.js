// Write your package code here!
var DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
var DEFAULT_REQUESTS_PER_INTERVAL = 10;
var RateLimitingDict = {
		userId: 'userId',
		IPAddr: 'connection.clientAddress',
		method: 'method'
	}

var ruleMappingtoMethodInvocationDict = function(d, m) {
		var arr = RateLimitingDict[d].split('.');
		while  (firstGuy = arr.shift()) {
			if (m[firstGuy])
				m = m[firstGuy];
		}
		return m;
	};

RateLimiter = function () {
	var self = this;
	self.rules = [];
	self.ruleId = 0;
	self.ruleInvocationCounters = {};
}

/**
 * Returns an object of invocation validity, time to reset and number of calls left
 * @param  {[type]}
 * @return {[type]}
 */
RateLimiter.prototype.check = function(methodInvocation) {
	var self = this;
	var reply = {valid: true, timeToReset: Infinity, numInvocationsLeft: Infinity};
	// Figure out all the rules this method invocation matches
	_.find(self.rules, function(rule) {
		// Check if this rule should be applied for this method invocation
		if (RateLimiter.prototype.matchRuleUsingFind(rule, methodInvocation)) {
			var methodString = RateLimiter._generateMethodInvocationKeyStringFromRuleMapping(rule, methodInvocation);
			var timeSinceLastReset = new Date().getTime() - rule._lastResetTime;
			var timeToNextReset = rule.intervalTime - timeSinceLastReset;
			var numInvocations = self.ruleInvocationCounters[rule.ruleId][methodString];
	
			if (numInvocations > rule.numRequestsAllowed && timeSinceLastReset < rule.intervalTime) {
				reply = {valid: false, timeToReset: timeToNextReset, numInvocationsLeft: 0}
				return true;
			} else {
				if (rule.numRequestsAllowed - numInvocations < reply.numInvocationsLeft)
					reply = {valid: true, timeToReset: timeToNextReset < 0 ? rule.intervalTime : 
						timeToNextReset, numInvocationsLeft: rule.numRequestsAllowed - numInvocations};
			}
		}
	});
	return reply;
}

/**
 * Add a rule to a specified domain or white list certain domains
 * @param {object} identifierQuery Domain to add rate limit rule
 * 		identifierQuery = { userId: ID | function() | null,
 * 							IPAddr: ID | function() | null, 
 * 							method: name | function() | null,
 * 							<sessionId: ID | function() | null>, 
 * 							<publication: name | function() | null>,
 * 							<function: name | function() | null>}.
 * 							ALL FUNCTIONS MUST RETURN TRUE/FALSE to input to determine whether it applies or not
 * @param {int} numRequestsAllowed number of requests allowed per timeframe
 */

RateLimiter.prototype.addRule = function(identifierQuery, numRequestsAllowed, intervalTime) {
	identifierQuery.ruleId = this._createNewRuleId();
	identifierQuery.numRequestsAllowed = numRequestsAllowed ? numRequestsAllowed : DEFAULT_REQUESTS_PER_INTERVAL;
	identifierQuery.intervalTime = intervalTime ? intervalTime : DEFAULT_INTERVAL_TIME_IN_MILLISECONDS;
	identifierQuery._lastResetTime = new Date().getTime();
	this.rules.push(identifierQuery);
}
/**
 * Initial version of Match Rule - NO LONGER NECESSARY :D
 * @param  {[type]}
 * @param  {[type]}
 * @return {[type]}
 */
RateLimiter.prototype.matchRule = function(rule, methodInvocation) {
	console.log(rule);
	var results = _.map(rule, function(value, key) {
		if (typeof value === 'function') {
			//  TODO BROKEN - metod invocation in this case must be specified to be an IP, user.Id or client addr
			if (! value(methodInvocation)) {
				return false;
			}
		} else if (value === null) {
			return;
		} else if (key === 'userId') {
			if (value !== methodInvocation.userId) {
				return false;
			}
		} else if (key === 'IPAddr') {
			if (value !== methodInvocation.connection.clientAddress) { 
				return false;
			}
		} else if (key === 'method') {
			if (value !== methodInvocation.method) {
				return false;
			}
		}
		return true;
	});

	var firstFalse = _.find(results, function(v) { return !v; });
	return firstFalse !== false;
}
/**
 * @param  {object}	rule Rule that is defined according to the spec above 
 * @param  {object} methodInvocation Method Invocation as described in DDPCommon.MethodInvocation with an added field of method
 * @return {boolean} boolean True if this methodInvocation matches said rule, false otherwise
 */
RateLimiter.prototype.matchRuleUsingFind = function(rule, methodInvocation) {
	var ruleMatches = true;
	
	_.find(RateLimitingDict, function(value, key) {
		if (rule[key]) {
			var methodInvocationValue = ruleMappingtoMethodInvocationDict(key, methodInvocation);
			if (typeof rule[key] === 'function') {
				if (! rule[key](methodInvocationValue)) {
					ruleMatches = false;
					return true;
				}
			} else {
				if (rule[key] !== methodInvocationValue) {
					ruleMatches = false;
					return true;
				}
			}
		}
	});

	return ruleMatches;
}

/**
 * @param  {object} methodInvocation Method invocation object
 * @return {[type]}
 */
RateLimiter.prototype.increment = function(methodInvocation) {
	var self = this;
	// Figure out all the rules this method invocation matches
	_.each(this.rules, function(rule) {
		// Check if this rule should be applied for this method invocation
		if (RateLimiter.prototype.matchRuleUsingFind(rule, methodInvocation)) {
			var methodString = RateLimiter._generateMethodInvocationKeyStringFromRuleMapping(rule, methodInvocation);
			var timeSinceLastReset = new Date().getTime() - rule._lastResetTime;
			if (timeSinceLastReset > rule.intervalTime) {
				rule._lastResetTime = new Date().getTime();
				// Reset all the counters for this rule
				_.each(self.ruleInvocationCounters[rule.ruleId], function(methodString) {
					methodString = 0;
				});
			}
			var timeToNextReset = rule.intervalTime - timeSinceLastReset;
			if (rule.ruleId in self.ruleInvocationCounters) {
				if (methodString in self.ruleInvocationCounters[rule.ruleId]) {
					self.ruleInvocationCounters[rule.ruleId][methodString]++;
				} else {
					self.ruleInvocationCounters[rule.ruleId][methodString] = 1;
				}
			}  else {
				self.ruleInvocationCounters[rule.ruleId] = {};
				self.ruleInvocationCounters[rule.ruleId][methodString] = 1;
			}
		}
	});
}

RateLimiter.prototype._createNewRuleId = function() {
	return this.ruleId++;
}

RateLimiter._generateMethodInvocationKeyStringFromRuleMapping = function(rule, methodInvocation) {
	var returnString = "";

	_.each(RateLimitingDict, function(value, key) {
		if (rule[key]) {
			var methodValue = ruleMappingtoMethodInvocationDict(key, methodInvocation);
			if (typeof rule[key] === 'function') {
				returnString += key + rule[key](methodValue)
			}
			returnString += key + methodValue;
		}
	});
	return returnString;
}


