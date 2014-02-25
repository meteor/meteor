RepeatableRandom = function (options) {
  var self = this;

  options = _.extend({
  }, options);

  this.seed = [].concat(options.seed || Random.hexString(20));

  this._sequences = {};
};

// We don't expect to use this global scope object in production, only in the tests.
// Nonetheless, it provides a place of last resort where we can store global state
// TODO: Should we assert that we are testing, or somehow provide this only for the tests?
//  (But then the tests wouldn't be testing the same thing...)
var globalRepeatableRandomScope = {};

Meteor.repeatableRandom = function (key, fallbackScope) {
  var scope = DDP._CurrentInvocation.get() || fallbackScope; // || globalRepeatableRandomScope;
//  if (scope == globalRepeatableRandomScope) {
//    // TODO: Find a better solution here
//    Meteor._debug("Using global repeatable random scope");
//  }
  if (!scope) {
    // We aren't in a method invocation, there was no scope passed in, so
    //  we aren't actually repeatable
    Meteor._debug("Requested repeatable random, but no scope available");
    var seeds = [Random.hexString(20), key];
    return Random.create.apply(null, seeds);
  }
  var repeatableRandom = scope.repeatableRandom;
  if (!repeatableRandom) {
    scope.repeatableRandom = repeatableRandom = new RepeatableRandom({
      seed: scope.randomSeed
    });
  }
  return repeatableRandom._sequence(key);
};

_.extend(RepeatableRandom.prototype, {
  _sequence: function (key) {
    var self = this;
    
    var sequence = self._sequences[key] || null;
    if (sequence === null) {
      self._sequences[key] = sequence = Random.create.apply(null, self.seed.concat(key));
    }
    return sequence;
  }
});
