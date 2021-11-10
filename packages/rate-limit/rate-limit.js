import { Meteor } from 'meteor/meteor';
import { Random } from 'meteor/random';

// Default time interval (in milliseconds) to reset rate limit counters
const DEFAULT_INTERVAL_TIME_IN_MILLISECONDS = 1000;
// Default number of events allowed per time interval
const DEFAULT_REQUESTS_PER_INTERVAL = 10;

const hasOwn = Object.prototype.hasOwnProperty;

function compatOptions(options) {
  if (options.numRequestsAllowed == null) {
    return options;
  }
  const { numRequestsAllowed, intervalTime, callback } = options;
  return {
    callback,
    initialCapacity: numRequestsAllowed,
    maxCapacity: numRequestsAllowed,
    refillRate: numRequestsAllowed / intervalTime,
  };
}

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
class Rule {
  constructor(options, matchers) {
    this.id = Random.id();

    const {
      callback,
      initialCapacity,
      maxCapacity,
      refillRate,
    } = compatOptions(options);
    this.callback = callback;
    this.initialCapacity = initialCapacity;
    this.maxCapacity = maxCapacity;
    this.refillRate = refillRate;

    this._matchers = matchers;

    this.buckets = new Map(); // key(input) => { currentCapacity, lastRefill, expiresAt }

    this.nextExpiryCheck = -1;
    const timeToMaxCapacity = Math.ceil(maxCapacity / refillRate);
    this.expiryCheckInterval = timeToMaxCapacity;
    this.expiryBuffer = Math.ceil(timeToMaxCapacity / 2); // how long to keep filled buckets
  }

  // Determine if this rule applies to the given input by comparing all
  // rule.matchers. If the match fails, search short circuits instead of
  // iterating through all matchers.
  match(input) {
    return Object
      .entries(this._matchers)
      .every(([key, matcher]) => {
        if (matcher !== null) {
          if (!hasOwn.call(input, key)) {
            return false;
          } else if (typeof matcher === 'function') {
            if (!(matcher(input[key]))) {
              return false;
            }
          } else if (matcher !== input[key]) {
            return false;
          }
        }
        return true;
      });
  }

  // Generates unique key string for provided input by concatenating all the
  // keys in the matcher with the corresponding values in the input.
  // Only called if rule matches input.
  _generateKeyString(input) {
    return Object.entries(this._matchers)
      .filter(([key]) => this._matchers[key] !== null)
      .reduce((returnString, [key, matcher]) => {
        if (typeof matcher === 'function') {
          if (matcher(input[key])) {
            returnString += key + input[key];
          }
        } else {
          returnString += key + input[key];
        }
        return returnString;
      }, '');
  }

  // Applies the provided input and returns the key string, time since counters
  // were last reset and time to next reset.
  apply(input) {
    const now = Date.now();
    if (now > this.nextExpiryCheck) {
      this.removeExpiredBuckets();
    }
    const key = this._generateKeyString(input);
    let bucket = this.buckets.get(key);
    if (bucket == null) {
      bucket = {
        currentCapacity: this.initialCapacity,
        lastRefill: now,
        expiresAt: now + this.expiryBuffer,
      };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.lastRefill;
      const frac = elapsed * this.refillRate; // eg, 5.33 quota accrued
      const whole = Math.trunc(frac);
      if (whole > 0) {
        const newCapacity = Math.max(0, bucket.currentCapacity) + whole;
        if (newCapacity <= this.maxCapacity) {
          bucket.currentCapacity = newCapacity;
          bucket.lastRefill = now - (frac - whole) / this.refillRate;
          const timeToFill =
            (this.maxCapacity - newCapacity) * this.refillRate;
          bucket.expiresAt = bucket.lastRefill + timeToFill + this.expiryBuffer;
        } else {
          bucket.currentCapacity = this.maxCapacity;
          bucket.lastRefill = now;
          bucket.expiresAt = now + this.expiryBuffer;
        }
      }
    }
    const timeSinceLastReset = now - bucket.lastRefill;
    const timeToNextReset = bucket.lastRefill + 1 / this.refillRate - now;
    return {
      key,
      bucket,
      timeSinceLastReset,
      timeToNextReset,
    };
  }

  removeExpiredBuckets() {
    const now = Date.now();
    this.buckets.forEach((bucket, key) => {
      const expired = now > bucket.expiresAt;
      if (expired) {
        this.buckets.delete(key);
      }
    });
    this.nextExpiryCheck = now + this.expiryCheckInterval;
  }

  _executeCallback(reply, ruleInput) {
    try {
      if (this.callback) {
        this.callback(reply, ruleInput);
      }
    } catch (e) {
      // Do not throw error here
      console.error(e);
    }
  }
}

class RateLimiter {
  // Initialize rules to be an empty dictionary.
  constructor() {
    // Dictionary of all rules associated with this RateLimiter, keyed by their
    // id. Each rule object stores the rule pattern, number of events allowed,
    // last reset time and the rule reset interval in milliseconds.

    this.rules = {};
  }

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
  check(input) {
    const reply = {
      allowed: true,
      timeToReset: 0,
      numInvocationsLeft: Infinity,
    };
    const matchedRules = this._findAllMatchingRules(input);
    matchedRules.forEach((rule) => {
      const ruleResult = rule.apply(input);
      const allowed = ruleResult.bucket.currentCapacity >= 0;
      if (!allowed) {
        // Only update timeToReset if the new time would be longer than the
        // previously set time. This is to ensure that if this input triggers
        // multiple rules, we return the longest period of time until they can
        // successfully make another call
        if (reply.timeToReset < ruleResult.timeToNextReset) {
          reply.timeToReset = ruleResult.timeToNextReset;
        }
        reply.allowed = false;
        reply.numInvocationsLeft = 0;
        rule._executeCallback(reply, input);
      } else {
        const numInvocationsLeft = Math.max(
          0,
          ruleResult.bucket.currentCapacity,
        );
        // If this is an allowed attempt and we haven't failed on any of the
        // other rules that match, update the reply field.
        if (numInvocationsLeft < reply.numInvocationsLeft && reply.allowed) {
          reply.timeToReset = ruleResult.timeToNextReset;
          reply.numInvocationsLeft = numInvocationsLeft;
        }
        rule._executeCallback(reply, input);
      }
    });
    return reply;
  }

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
  * @param {function} callback Optional. Function to be called after a
  * rule is executed. Two objects will be passed to this function.
  * The first one is the result of RateLimiter.prototype.check
  * The second is the input object of the rule, it has the following structure:
  * {
  *   'type': string - either 'method' or 'subscription'
  *   'name': string - the name of the method or subscription being called
  *   'userId': string - the user ID attempting the method or subscription
  *   'connectionId': string - a string representing the user's DDP connection
  *   'clientAddress': string - the IP address of the user
  * }
  * @return {string} Returns unique rule id
  */
  addRule(rule, numRequestsAllowed, intervalTime, callback) {
    const options = {
      numRequestsAllowed: numRequestsAllowed || DEFAULT_REQUESTS_PER_INTERVAL,
      intervalTime: intervalTime || DEFAULT_INTERVAL_TIME_IN_MILLISECONDS,
      callback: callback && Meteor.bindEnvironment(callback),
    };

    const newRule = new Rule(options, rule);
    this.rules[newRule.id] = newRule;
    return newRule.id;
  }

  /**
  * Increment counters in every rule that match to this input
  * @param  {object} input Dictionary object containing attributes that may
  * match to rules
  */
  increment(input) {
    const cost = 1;
    const matchedRules = this._findAllMatchingRules(input);
    matchedRules.forEach(rule => {
      const ruleResult = rule.apply(input);
      ruleResult.bucket.currentCapacity = Math.max(ruleResult.bucket.currentCapacity, 0) - cost;
    });
  }

  // Returns an array of all rules that apply to provided input
  _findAllMatchingRules(input) {
    return Object.values(this.rules).filter(rule => rule.match(input));
  }

  /**
   * Provides a mechanism to remove rules from the rate limiter. Returns boolean
   * about success.
   * @param  {string} id Rule id returned from #addRule
   * @return {boolean} Returns true if rule was found and deleted, else false.
   */
  removeRule(id) {
    if (this.rules[id]) {
      delete this.rules[id];
      return true;
    }
    return false;
  }
}

export { RateLimiter };
