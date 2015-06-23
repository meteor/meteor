// Default time interval (in milliseconds) to reset rate limit counters
var DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of requets allowed per time interval
var DEFAULT_REQUESTS_PER_INTERVAL = 10;
var RULE_PRIVATE_FIELDS = [ '_ruleId', '_lastResetTime', '_numRequestsAllowed',
  '_intervalTime'];

// Initialize rules, ruleId, and invocations to be empty
RateLimiter = function() {
  var self = this;
  self.rules = [];
  self._ruleId = 0;
  self.ruleCounters = {};
}

/**
 * Checks if this input is valid
 * @param  {object} input dictionary containing key-value pairs of attributes that match to rules
 * @return {object} Returns object of whether method invocation is valid, time
 * to next reset and number invocations left
 */
RateLimiter.prototype.check = function( input ) {
  var self = this;
  var reply = {
    valid: true,
    timeToReset: 0,
    numInvocationsLeft: Infinity
  };

  _.each( self.rules, function( rule ) {
    if ( self._matchRule( rule, input ) ) {
      var matchRuleHelper = self._ruleHelper( rule, input );
      var numInvocations = self.ruleCounters[ rule._ruleId ][
        matchRuleHelper.methodString];
      if ( numInvocations > rule._numRequestsAllowed &&
        matchRuleHelper.timeSinceLastReset < rule._intervalTime ) {
        if ( reply.timeToReset < matchRuleHelper.timeToNextReset ) {
          reply.timeToReset = matchRuleHelper.timeToNextReset;
        };
        reply.valid = false;
        reply.numInvocationsLeft = 0;
      } else {
        if ( rule._numRequestsAllowed - numInvocations < reply.numInvocationsLeft &&
          reply.valid ) {
          reply.valid = true;
          reply.timeToReset = matchRuleHelper.timeToNextReset < 0 ? rule._intervalTime :
            matchRuleHelper.timeToNextReset;
          reply.numInvocationsLeft = rule._numRequestsAllowed -
            numInvocations;
        }
      }
    }
  } );
  return reply;
}

/**
 * Appends a rule to list of rules that are checked against on every method invocation
 * @param {object} rule    Input dictionary defining certain attributes and rules associated with them.
 * Each attribute's value can either be a value, a function or null. All functions must return a boolean
 * response saying whether the input is allowed by that attribute's rule or not
 * @param {integer} numRequestsAllowed Number of requests allowed per interval
 * @param {integer} intervalTime       Number of milliseconds before interval is reset
 */
RateLimiter.prototype.addRule = function( rule, numRequestsAllowed,
  intervalTime ) {
  rule._ruleId = this._createNewRuleId();
  rule._numRequestsAllowed = numRequestsAllowed ||
    DEFAULT_REQUESTS_PER_INTERVAL;
  rule._intervalTime = intervalTime || DEFAULT_INTERVAL_TIME_IN_MILLISECONDS;
  rule._lastResetTime = new Date().getTime();
  this.rules.push( rule );
}

/**
 * Matches whether a given input matches a certain rule. Short
 * circuits search if rule and method invocation don't match
 * @param  {object} rule Input rule as defined above
 * @param  {object} input Custom input object to match against rules
 * @return {boolean} Returns whether the boolean matches inputted rule
 */
RateLimiter.prototype._matchRule = function( rule, input ) {
  var self = this;
  var ruleMatches = true;
  _.find( rule, function( value, key ) {
    if ( value !== null && !_.contains( RULE_PRIVATE_FIELDS, key ) ) {
      if ( !( key in input ) ) {
        ruleMatches = false;
        return true;
      } else {
        if ( typeof value === 'function' ) {
          if ( !( value( input[ key ] ) ) ) {
            ruleMatches = false;
            return true;
          }
        } else {
          if ( value !== input[ key ] ) {
            ruleMatches = false;
            return true;
          }
        }
      }
    }
  } );
  return ruleMatches;
}


/**
 * Increment appropriate rule counters on every input
 * @param  {object} input Dictionary object containing attributes that may match to
 * certain rules
 */
RateLimiter.prototype.increment = function( input ) {
  var self = this;

  // Only increment rule counters that match this input
  _.each( self.rules, function( rule ) {
    if ( self._matchRule( rule, input ) ) {
      var matchRuleHelper = self._ruleHelper( rule, input );

      if ( matchRuleHelper.timeSinceLastReset > rule._intervalTime ) {
        // Reset all the counters since the rule has reset
        rule._lastResetTime = new Date().getTime();
        _.each( self.ruleCounters[ rule._ruleId ], function( value,
          keyString ) {
          self.ruleCounters[ rule._ruleId ][ keyString ] = 0;
        } );
      }

      if ( rule._ruleId in self.ruleCounters ) {
        if ( matchRuleHelper.methodString in self.ruleCounters[ rule._ruleId ] ) {
          self.ruleCounters[ rule._ruleId ][ matchRuleHelper.methodString ]++;
        } else {
          self.ruleCounters[ rule._ruleId ][ matchRuleHelper.methodString ] =
            1;
        }
      } else {
        self.ruleCounters[ rule._ruleId ] = {};
        self.ruleCounters[ rule._ruleId ][ matchRuleHelper.methodString ] =
          1;
      }
    }
  } );
}

// Creates new unique rule id
RateLimiter.prototype._createNewRuleId = function() {
  return this._ruleId++;
}

/**
 * Generates unique key string per rule for input for key to specific rule counter dictionary
 * @param  {object} rule Rule defined as input to #addRule
 * @param  {object} input Dictionary of attributes that match to the given rule
 * @return {string} Key string made of all fields from rule that match in
 * input
 */
RateLimiter.prototype._generateKeyString = function( rule, input ) {
  var self = this;
  var returnString = "";
  _.each( rule, function( value, key ) {
    if ( value !== null && !_.contains( RULE_PRIVATE_FIELDS, key ) ) {
      if ( typeof value === 'function' ) {
        if ( value( input[ key ] ) ) {
          returnString += key + input[ key ];
        }
      } else {
        returnString += key + input[ key ];
      }
    }
  } );
  return returnString;
}

RateLimiter.prototype._ruleHelper = function( rule, input ) {
  var self = this;
  var keyString = self._generateKeyString( rule, input );
  var timeSinceLastReset = new Date().getTime() - rule._lastResetTime;
  var timeToNextReset = rule._intervalTime - timeSinceLastReset;
  return {
    methodString: keyString,
    timeSinceLastReset: timeSinceLastReset,
    timeToNextReset: timeToNextReset
  };

}