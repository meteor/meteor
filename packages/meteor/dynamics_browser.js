// Simple implementation of dynamic scoping, for use in browsers

(function () {

  var nextSlot = 0;
  var currentValues = [];

  Meteor.EnvironmentVariable = function () {
    this.slot = nextSlot++;
  };

  _.extend(Meteor.EnvironmentVariable.prototype, {
    get: function () {
      return currentValues[this.slot];
    },

    withValue: function (value, func) {
      var saved = currentValues[this.slot];
      try {
        currentValues[this.slot] = value;
        var ret = func();
      } finally {
        currentValues[this.slot] = saved;
      }
      return ret;
    }
  });

  Meteor.bindEnvironment = function (func, onException, _this) {
    // needed in order to be able to create closures inside func and
    // have the closed variables not change back to their original
    // values
    var boundValues = _.clone(currentValues);

    if (!onException)
      throw new Error("onException must be supplied");

    return function (/* arguments */) {
      var savedValues = currentValues;
      try {
        currentValues = boundValues;
        var ret = func.apply(_this, _.toArray(arguments));
      } catch (e) {
        onException(e);
      } finally {
        currentValues = savedValues;
      }
      return ret;
    };
  };

})();
