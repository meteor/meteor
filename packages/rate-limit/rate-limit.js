// Default time interval (in milliseconds) to reset rate limit counters
var DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of requets allowed per time interval
var DEFAULT_REQUESTS_PER_INTERVAL = 10;
// Mapping from rate limiting rules format to method invocation fields.
var RATE_LIMITING_DICT = {
  userId: 'userId',
  IPAddr: 'connection.clientAddress',
  method: 'method'
}

// Initialize rules, ruleId, and invocations to be empty
RateLimiter = function() {
  var self = this;
  self.rules = [];
  self.ruleId = 0;
  self.ruleInvocationCounters = {};
}

/**
 * Checks if this method invocation is valid
 * @param  {object} methodInvocation DDPCommon.MethodInvocation object with
 * added 'method' attribute listing the method name
 * @return {object} Returns object of whether method invocation is valid, time
 * to next reset and number invocations left
 */
RateLimiter.prototype.check = function( methodInvocation ) {
  var self = this;
  var reply = {
    valid: true,
    timeToReset: 0,
    numInvocationsLeft: Infinity
  };
  // Figure out all the rules this method invocation matches
  _.each( self.rules, function( rule ) {
    // Check if this rule should be applied for this method invocation
    if ( RateLimiter.prototype.matchRuleUsingFind( rule, methodInvocation ) ) {
      var matchRuleHelper = self._matchRuleHelper( rule, methodInvocation );

      var numInvocations = self.ruleInvocationCounters[ rule.ruleId ]
        [ matchRuleHelper.methodString ];

      if ( numInvocations > rule.numRequestsAllowed &&
        matchRuleHelper.timeSinceLastReset < rule.intervalTime ) {
        if ( reply.timeToReset < matchRuleHelper.timeToNextReset ) {
          reply.timeToReset = matchRuleHelper.timeToNextReset;
        };
        reply.valid = false;
        reply.numInvocationsLeft = 0;
      } else {
        if ( rule.numRequestsAllowed - numInvocations < reply.numInvocationsLeft &&
          reply.valid ) {
          reply = {
            valid: true,
            timeToReset: matchRuleHelper.timeToNextReset < 0 ?
              rule.intervalTime : matchRuleHelper.timeToNextReset,
            numInvocationsLeft: rule.numRequestsAllowed -
              numInvocations
          };
        }
      }
    }
  } );

  return reply;
}

/**
 * Adds a rule to with a specified identifier query to list of rules that are
 * checked against on every method invocation
 * @param {object} identifierQuery    Specified domain for rate limit rule
 *                                    { userId: ID | function() | null,
 *                                      IPAddr: ID | function() | null,
 *                                      method: name | function() | null
 *  All functions must return T/F to input to determine rule match
 * @param {integer} numRequestsAllowed Number of requests allowed per interval
 * @param {integer} intervalTime       Number of milliseconds before interval is reset
 */
RateLimiter.prototype.addRule = function( identifierQuery, numRequestsAllowed,
  intervalTime ) {
  identifierQuery.ruleId = this._createNewRuleId();
  identifierQuery.numRequestsAllowed = numRequestsAllowed ||
    DEFAULT_REQUESTS_PER_INTERVAL;
  identifierQuery.intervalTime = intervalTime ||
    DEFAULT_INTERVAL_TIME_IN_MILLISECONDS;
  identifierQuery._lastResetTime = new Date().getTime();
  this.rules.push( identifierQuery );
}

/**
 * Matches whether a given method invocation matches a certain rule. Short
 * circuits search if rule and method invocation don't match
 * @param  {object} rule Rule as defined as an identifierQuery above
 * @param  {object} methodInvocation DDPCommon.MethodInvocation object with
 * added 'method' attribute listing the method name
 * @return {boolean} Returns whether the methodInvocation matches inputted rule
 */
RateLimiter.prototype.matchRuleUsingFind = function( rule, methodInvocation ) {
  var self = this;
  var ruleMatches = true;
  _.find( RATE_LIMITING_DICT, function( value, key ) {
    if ( rule[ key ] ) {
      var methodInvocationValue = self._ruleMappingtoMethodInvocationDict(
        key, methodInvocation );
      if ( typeof rule[ key ] === 'function' ) {
        if ( !rule[ key ]( methodInvocationValue ) ) {
          ruleMatches = false;
          return true;
        }
      } else {
        if ( rule[ key ] !== methodInvocationValue ) {
          ruleMatches = false;
          return true;
        }
      }
    }
  } );

  return ruleMatches;
}

/**
 * Increment appropriate counters on every method invocation
 * @param  {object} methodInvocation DDPCommon.MethodInvocation object with
 * added 'method' attribute listing the method name
 */
RateLimiter.prototype.increment = function( methodInvocation ) {
  var self = this;
  // Figure out all the rules this method invocation matches
  _.each( this.rules, function( rule ) {
    // Check if this rule should be applied for this method invocation
    if ( RateLimiter.prototype.matchRuleUsingFind( rule, methodInvocation ) ) {
      var matchRuleHelper = self._matchRuleHelper( rule, methodInvocation )

      if ( matchRuleHelper.timeSinceLastReset > rule.intervalTime ) {
        rule._lastResetTime = new Date().getTime();
        // Reset all the counters for this rule
        _.each( self.ruleInvocationCounters[ rule.ruleId ], function(
          value, methodString ) {
          self.ruleInvocationCounters[ rule.ruleId ][ methodString ] =
            0;
        } );
      }
      if ( rule.ruleId in self.ruleInvocationCounters ) {
        if ( matchRuleHelper.methodString in self.ruleInvocationCounters[
            rule.ruleId ] ) {
          self.ruleInvocationCounters[ rule.ruleId ][ matchRuleHelper.methodString ]++;
        } else {
          self.ruleInvocationCounters[ rule.ruleId ][ matchRuleHelper.methodString ] =
            1;
        }
      } else {
        self.ruleInvocationCounters[ rule.ruleId ] = {};
        self.ruleInvocationCounters[ rule.ruleId ][ matchRuleHelper.methodString ] =
          1;
      }
    }
  } );
}

// Creates new unique rule id
RateLimiter.prototype._createNewRuleId = function() {
  return this.ruleId++;
}

/**
 * Generates string of fields that match between method invocation and rule to
 * be used as a key for counters dictionary per rule
 * @param  {object} rule Rule defined as identifierQuery in addRule
 * @param  {object} methodInvocation DDPCommon.MethodInvocation object with
 * added 'method' attribute listing the method name
 * @return {string} Key string made of all fields from rule that match in
 * method invocation
 */
RateLimiter.prototype._generateMethodInvocationKeyStringFromRuleMapping =
  function( rule, methodInvocation ) {
    var self = this;
    var returnString = "";
    _.each( RATE_LIMITING_DICT, function( value, key ) {
      if ( rule[ key ] ) {
        var methodValue = self._ruleMappingtoMethodInvocationDict( key,
          methodInvocation );
        if ( typeof rule[ key ] === 'function' ) {
          if ( rule[ key ]( methodValue ) )
            returnString += key + methodValue;
        } else {
          returnString += key + methodValue;
        }
      }
    } );
    return returnString;
  }

/**
 * Helper method that uses the RATE_LIMITING_DICT to create a fast way to
 * access values in methodInvocation without manually parsing the paths
 * @param  {string} key Key in rule dictionary (ie userId, IPAddr, method)
 * @param  {string} methodInvocation MethodInvocation object that is traversed
 * to get the final value
 * @return {object} Returns a string, value, or object of whatever is stored in
 * appropriate field in MethodInvocation
 */
RateLimiter.prototype._ruleMappingtoMethodInvocationDict = function( key,
  methodInvocation ) {

  var arr = RATE_LIMITING_DICT[ key ].split( '.' );
  while ( firstGuy = arr.shift() ) {
    if ( firstGuy in methodInvocation )
      methodInvocation = methodInvocation[ firstGuy ];
  }
  return methodInvocation;
};

RateLimiter.prototype._matchRuleHelper = function( rule, methodInvocation ) {
  var self = this;

  var methodString = self._generateMethodInvocationKeyStringFromRuleMapping(
    rule, methodInvocation );
  var timeSinceLastReset = new Date().getTime() - rule._lastResetTime;
  var timeToNextReset = rule.intervalTime - timeSinceLastReset;
  return {
    methodString: methodString,
    timeSinceLastReset: timeSinceLastReset,
    timeToNextReset: timeToNextReset
  };
}