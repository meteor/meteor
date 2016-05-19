// Default time interval (in milliseconds) to reset rate limit counters
var DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of events allowed per time interval
var DEFAULT_REQUESTS_PER_INTERVAL = 10;

// A rule is defined by an options object that contains two fields,
// `numRequestsAllowed` which is the number of events allowed per interval, and
// an `intervalTime` which is the amount of time in milliseconds before the
// rate limit restarts its internal counters, and by a matchers object. A
// matchers object is a POJO that contains a set of keys with values that
// define the entire set of inputs that match for each key. The values can
// either be null (optional), a primitive or a function that returns a boolean
// of whether the provided input's value matches for this key.
//
// Rules are uniquely assigned an `id` and they store a dictionary of counters,
// which are records used to keep track of inputs that match the rule. If a
// counter reaches the `numRequestsAllowed` within a given `intervalTime`, a
// rate limit is reached and future inputs that map to that counter will
// result in errors being returned to the client.
var Rule = function (options, matchers) {
  var self = this;

  self.id = Random.id();

  self.options = options;

  self._matchers = matchers;

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
    return _.every(self._matchers, function (matcher, key) {
      if (matcher !== null) {
        if (!(_.has(input,key))) {
          return false;
        } else {
          if (typeof matcher === 'function') {
            if (!(matcher(input[key]))) {
              return false;
            }
          } else {
            if (matcher !== input[key]) {
              return false;
            }
          }
        }
      }
      return true;
    });
  },

  // Generates unique key string for provided input by concatenating all the
  // keys in the matcher with the corresponding values in the input.
  // Only called if rule matches input.
  _generateKeyString: function (input) {
    var self = this;
    var returnString = "";
    _.each(self._matchers, function (matcher, key) {
      if (matcher !== null) {
        if (typeof matcher === 'function') {
          if (matcher(input[key])) {
            returnString += key + input[key];
          }
        } else {
          returnString += key + input[key];
        }
      }
    });
    return returnString;
  },

  // Applies the provided input and returns the key string, time since counters
  // were last reset and time to next reset.
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
  // Reset counter dictionary for this specific rule. Called once the
  // timeSinceLastReset has exceeded the intervalTime. _lastResetTime is
  // set to be the current time in milliseconds.
  resetCounter: function () {
    var self = this;

    // Delete the old counters dictionary to allow for garbage collection
    self.counters = {};
    self._lastResetTime = new Date().getTime();
  }
});

// Initialize rules to be an empty dictionary.
RateLimiter = function () {
  var self = this;

  // Dictionary of all rules associated with this RateLimiter, keyed by their
  // id. Each rule object stores the rule pattern, number of events allowed,
  // last reset time and the rule reset interval in milliseconds.
  self.rules = {};
};

/**
 * Checks if this input has exceeded any rate limits.
 * @param  {object} input dictionary containing key-value pairs of attributes
 * that match to rules
 * @return {object} Returns object of following structure
 * { 'allowed': boolean - is this input allowed
 *   'timeToReset': integer | Infinity - returns time until counters are reset
 *                   in milliseconds
 *   'numInvocationsLeft': integer | Infinity - returns number of calls left
 *   before limit is reached
 * }
 * If multiple rules match, the least number of invocations left is returned.
 * If the rate limit has been reached, the longest timeToReset is returned.
 */
RateLimiter.prototype.check = function (input) {
  var self = this;
  var reply = {
    allowed: true,
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
      ruleResult.timeSinceLastReset = new Date().getTime() -
        rule._lastResetTime;
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
      reply.allowed = false;
      reply.numInvocationsLeft = 0;
    } else {
      // If this is an allowed attempt and we haven't failed on any of the
      // other rules that match, update the reply field.
      if (rule.options.numRequestsAllowed - numInvocations <
        reply.numInvocationsLeft && reply.allowed) {
        reply.timeToReset = ruleResult.timeToNextReset;
        reply.numInvocationsLeft = rule.options.numRequestsAllowed -
          numInvocations;
      }
    }
  });
  return reply;
};

/**
 * Adds a rule to dictionary of rules that are checked against on every call.
 * Only inputs that pass all of the rules will be allowed. Returns unique rule
 * id that can be passed to `removeRule`.
 * @param {object} rule    Input dictionary defining certain attributes and
 * rules associated with them.
 * Each attribute's value can either be a value, a function or null. All
 * functions must return a boolean of whether the input is matched by that
 * attribute's rule or not
 * @param {integer} numRequestsAllowed Optional. Number of events allowed per
 * interval. Default = 10.
 * @param {integer} intervalTime Optional. Number of milliseconds before
 * rule's counters are reset. Default = 1000.
 * @return {string} Returns unique rule id
 */
RateLimiter.prototype.addRule = function (rule, numRequestsAllowed,
  intervalTime) {
  var self = this;

  var options = {
    numRequestsAllowed: numRequestsAllowed || DEFAULT_REQUESTS_PER_INTERVAL,
    intervalTime: intervalTime || DEFAULT_INTERVAL_TIME_IN_MILLISECONDS
  };

  var newRule = new Rule(options, rule);
  this.rules[newRule.id] = newRule;
  return newRule.id;
};

/**
 * Increment counters in every rule that match to this input
 * @param  {object} input Dictionary object containing attributes that may
 * match to rules
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
};

// Returns an array of all rules that apply to provided input
RateLimiter.prototype._findAllMatchingRules = function (input) {
  var self = this;

  return _.filter(self.rules, function(rule) {
    return rule.match(input);
  });
};
/**
 * Provides a mechanism to remove rules from the rate limiter. Returns boolean
 * about success.
 * @param  {string} id Rule id returned from #addRule
 * @return {boolean} Returns true if rule was found and deleted, else false.
 */
RateLimiter.prototype.removeRule = function (id) {
  var self = this;
  if (self.rules[id]) {
    delete self.rules[id];
    return true;
  } else {
    return false;
  }
};
