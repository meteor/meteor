// Default time interval (in milliseconds) to reset rate limit counters
var DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of requets allowed per time interval
var DEFAULT_REQUESTS_PER_INTERVAL = 10;

var Rule = function (options, matchers) {
  var self = this;

  // Options contains the timeToReset and intervalTime
  self.options = options;

  // Dictionary of keys and all values that match for each key
  // The values can either be null (optional), a primitive or a function
  // that returns boolean of whether the provided input's value matches for
  // this key
  self.matchers = matchers;

  self._lastResetTime = new Date().getTime();

  // Dictionary of input keys to counters
  self.counters = {};
};

_.extend(Rule.prototype, {
  // Determine if this rule applies to the given input by comparing all
  // rule.matchers. If the match fails, search short circuits instead of
  // iterating through all matchers.
  match: function (input) {
    var self = this;
    var ruleMatches = true;
    _.find(self.matchers, function (value, key) {
      if (value !== null) {
        if (!(_.has(input,key))) {
          ruleMatches = false;
          return true;
        } else {
          if (typeof value === 'function') {
            if (!(value(input[key]))) {
              ruleMatches = false;
              return true;
            }
          } else {
            if (value !== input[key]) {
              ruleMatches = false;
              return true;
            }
          }
        }
      }
    });
    return ruleMatches;
  },

  // Generates unique key string for provided input
  // Only called if rule matches input.
  _generateKeyString: function (input) {
    var self = this;
    var returnString = "";
    _.each(self.matchers, function (value, key) {
      if (value !== null) {
        if (typeof value === 'function') {
          if (value(input[key])) {
            returnString += key + input[key];
          }
        } else {
          returnString += key + input[key];
        }
      }
    });
    return returnString;
  },

  // Generates the key, timeSinceLastReset and timeToNextReset once the rule
  // is applied
  apply: function (input) {
    var self = this;
    var keyString = self._generateKeyString(input);
    var timeSinceLastReset = new Date().getTime() - self._lastResetTime;
    var timeToNextReset = self.options.intervalTime - timeSinceLastReset;
    return {
      key: keyString,
      timeSinceLastReset: timeSinceLastReset,
      timeToNextReset: timeToNextReset
    };
  },
  // Reset all keys for this specific rule. Called once the timeSinceLastReset
  // has exceeded the intervalTime.
  resetCounter: function () {
    var self = this;
    _.each(self.counters, function (value, key) {
      self.counters[key] = 0;
    });
    self._lastResetTime = new Date().getTime();
  }
});

// Initialize rules, ruleId, and invocations to be empty
RateLimiter = function () {
  var self = this;

  // List of all rules associated with this RateLimiter. Each rule object stores
  // the rule pattern, number of requests allowed, last reset time and the rule
  // reset interval in milliseconds.
  self.rules = [];
}

/**
 * Checks if this input has exceeded any rate limits.
 * @param  {object} input dictionary containing key-value pairs of attributes that match to rules
 * @return {object} Returns object of whether method invocation is allowed, time
 * to next reset and number invocations left
 */
RateLimiter.prototype.check = function (input) {
  var self = this;
  var reply = {
    valid: true,
    timeToReset: 0,
    numInvocationsLeft: Infinity
  };

  var matchedRules = self._findAllMatchingRules(input);
  _.each(matchedRules, function (rule) {
    var ruleResult = rule.apply(input);
    var numInvocations = rule.counters[ruleResult.key];

    if (ruleResult.timeToNextReset < 0) {
      // Reset all the counters since the rule has reset
      rule.resetCounter();
      ruleResult.timeSinceLastReset = new Date().getTime() - rule._lastResetTime;
      ruleResult.timeToNextReset = rule.options.intervalTime;
      numInvocations = 0;
    }

    if (numInvocations > rule.options.numRequestsAllowed) {
      // Only update timeToReset if the new time would be longer than the
      // previously set time. This is to ensure that if this input triggers
      // multiple rules, we return the longest period of time until they can
      // successfully make another call
      if (reply.timeToReset < ruleResult.timeToNextReset) {
        reply.timeToReset = ruleResult.timeToNextReset;
      };
      reply.valid = false;
      reply.numInvocationsLeft = 0;
    } else {
      // If this is an allowed attempt and we haven't failed on any of the other rules that
      // match, update the reply field.
      if (rule.options.numRequestsAllowed - numInvocations < reply.numInvocationsLeft &&
        reply.valid) {
        reply.valid = true;
        reply.timeToReset = ruleResult.timeToNextReset < 0 ?
          rule.options.intervalTime :
          ruleResult.timeToNextReset;
        reply.numInvocationsLeft = rule.options.numRequestsAllowed -
          numInvocations;
      }
    }
  });
  return reply;
}

/**
 * Appends a rule to list of rules that are checked against on every method invocation
 * @param {object} rule    Input dictionary defining certain attributes and rules associated with them.
 * Each attribute's value can either be a value, a function or null. All functions must return a boolean
 * response saying whether the input is matched by that attribute's rule or not
 * @param {integer} numRequestsAllowed Number of requests allowed per interval
 * @param {integer} intervalTime       Number of milliseconds before interval is reset
 */
RateLimiter.prototype.addRule = function (rule, numRequestsAllowed, intervalTime) {
  var self = this;

  var options = {
    numRequestsAllowed: numRequestsAllowed || DEFAULT_REQUESTS_PER_INTERVAL,
    intervalTime: intervalTime || DEFAULT_INTERVAL_TIME_IN_MILLISECONDS
  }

  var newRule = new Rule(options, rule);
  this.rules.push(newRule);
}

/**
 * Increment appropriate rule counters on every input
 * @param  {object} input Dictionary object containing attributes that may match to
 * certain rules
 */
RateLimiter.prototype.increment = function (input) {
  var self = this;

  // Only increment rule counters that match this input
  var matchedRules = self._findAllMatchingRules(input);
  _.each(matchedRules, function (rule) {
    var ruleResult = rule.apply(input);

    if (ruleResult.timeSinceLastReset > rule.options.intervalTime) {
      // Reset all the counters since the rule has reset
      rule.resetCounter();
    }

    // Check whether the key exists, incrementing it if so or otherwise
    // adding the key and setting its value to 1
    if (_.has(rule.counters, ruleResult.key))
      rule.counters[ruleResult.key]++;
    else
      rule.counters[ruleResult.key] = 1;
  });
}

RateLimiter.prototype._findAllMatchingRules = function (input) {
  var self = this;

  var matchingRules = [];
  _.each(self.rules, function(rule) {
    if (rule.match(input))
      matchingRules.push(rule);
  });
  return matchingRules;
}