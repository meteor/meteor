// This file contains two classes:
//  * Rule - the general structure of rate limiter rules
//  * RateLimiter - a general rate limiter that stores rules and determines
//  whether inputs are allowed
//
//  ** Rules **
//  Rules are composed of the following fields:
//    - id Random id generated and used to key the rule in the rate limiter
//    - options Object that contains the intervalTime after which the rule is reset, and the
//              number of calls that are allowed in the specified interval time
//    - matchers Dictionary of keys that are searched for in the input provided to match
//               with values that define the set of values that match this rule. Values can be
//               objects or they can be functions that return a boolean of whether the provided
//               input matches. For example, if we only want to match all even ids, plus any other fields
//               , we could have a rule that included a key value pair as follows:
//               {
//               ...
//               id: function (id) {
//                return id % 2 === 0;
//               },
//               ...
//               }
//               A rule is only said to apply to a given input if every key in the matcher
//               matches to the input values.
//    - _lastResetTime Last time this rule's counters were reset. Last reset time is used to
//                     keep track if the interval time has passed
//    - counters Dictionary that stores the current state of inputs and number times they've
//               been passed to the rate limiter. Unique keys are made per input per rule that
//               create a concatenated string of all keys in the rule with the values from the
//               input
//
//               For example, if we had a rule with matchers as such:
//               {
//               userId: function(userId)  {
//                  return true;
//                },
//               methodName: 'hello'
//               }
//               and we were passed an input as follows:
//               {
//                userId: 'meteor'
//                methodName: 'hello'
//               }
//
//               The key generated would be 'userIdmeteormethodNamehello'.
//
//               These counters are checked on every invocation to determine whether a rate limit
//               has been reached.
//
// The methods provided are as follows:
//    * match(input) : Checks whether the rule applies to the provided input by comparing every
//                     field in the matcher to the provided input. Order of input doesn't matter,
//                     they just must contain the appropriate keys and the values must be allowed by
//                     the matcher
//    * _generateKeyString(input) : generates a key string by concatenating all the keys in the matcher
//                                  with the corresponding values in the input
//    * apply(input) : applies the provided input and returns the key string, the time since last
//                     reset and time to next reset
//    * resetCounter() : resets the counters for this rule and sets _lastResetTime to be the current time
//
//  ** Rate Limiter **
//  A rate limiter stores a dictionary of rules keyed by their rule Id. It provides the following methods:
//
//    * addRule(rule, numRequests, intervalTime) : adds a Rule to dictionary of rules and returns the user
//                                                 the rule Id
//    * removeRule(id) : removes a rule from the dictionary and returns boolean detailing success
//    * check(input) : checks all rules that apply to this input to see if any rate limits have been exceeded
//                     Returns an object as follows:
//                     {
//                      allowed: boolean - is this input allowed
//                      timeToReset: integer - returns time to reset in milliseconds
//                      numInvocationsLeft: integer - returns number of calls left before limit is reached
//                     }
//                     If multiple rules match, the least number of invocations left is returned. If the rate limit
//                     has been reached, the longest timeToReset is returned.
//
//    * increment(input) : increments counters in all rules that apply to this input.
//    * _findAllMatchingRules(input) : returns an array of all rules that apply to provided input
//



// Default time interval (in milliseconds) to reset rate limit counters
var DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of requets allowed per time interval
var DEFAULT_REQUESTS_PER_INTERVAL = 10;

var Rule = function (options, matchers) {
  var self = this;

  self.id = Random.id();
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

    // Delete the old counters dictionary to allow for garbage collection
    self.counters = {};
    self._lastResetTime = new Date().getTime();
  }
});

// Initialize rules, ruleId, and invocations to be empty
RateLimiter = function () {
  var self = this;

  // Dictionary of all rules associated with this RateLimiter, keyed by their
  // id. Each rule object stores the rule pattern, number of requests allowed,
  // last reset time and the rule reset interval in milliseconds.
  self.rules = {};
}

/**
 * Checks if this input has exceeded any rate limits.
 * @param  {object} input dictionary containing key-value pairs of attributes that match to rules
 * @return {object} Returns object of whether input is allowed, time
 * to next reset and number invocations left
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
      reply.allowed = false;
      reply.numInvocationsLeft = 0;
    } else {
      // If this is an allowed attempt and we haven't failed on any of the other rules that
      // match, update the reply field.
      if (rule.options.numRequestsAllowed - numInvocations < reply.numInvocationsLeft &&
        reply.allowed) {
        reply.allowed = true;
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
 * Adds a rule to dictionary of rules that are checked against on every call. Only inputs that
 * pass all of the rules will be allowed and order doesn't matter.
 * @param {object} rule    Input dictionary defining certain attributes and rules associated with them.
 * Each attribute's value can either be a value, a function or null. All functions must return a boolean
 * of whether the input is matched by that attribute's rule or not
 * @param {integer} numRequestsAllowed Number of requests allowed per interval
 * @param {integer} intervalTime       Number of milliseconds before interval is reset
 * @return {string} Returns the randomly generated rule id
 */
RateLimiter.prototype.addRule = function (rule, numRequestsAllowed, intervalTime) {
  var self = this;

  var options = {
    numRequestsAllowed: numRequestsAllowed || DEFAULT_REQUESTS_PER_INTERVAL,
    intervalTime: intervalTime || DEFAULT_INTERVAL_TIME_IN_MILLISECONDS
  }

  var newRule = new Rule(options, rule);
  this.rules[newRule.id] = newRule;
  return newRule.id;
}

/**
 * Increment counters in every rule that match to this input
 * @param  {object} input Dictionary object containing attributes that may match to
 * rules
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
/**
 * Provides a mechanism to remove rules from the rate limiter
 * @param  {string} id Rule id returned from #addRule
 * @return {boolean}    Returns true if rule was found and deleted, else false.
 */
RateLimiter.prototype.removeRule = function (id) {
  var self = this;
  if (self.rules[id]) {
    delete self.rules[id];
    return true;
  } else {
    return false;
  }
}