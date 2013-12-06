
UI.If = Component.extend({
  kind: 'If',
  init: function () {
    // XXX this probably deserves a better explanation if this code is
    // going to stay with us.
    this.condition = this.data;

    // content doesn't see the condition as `data`
    this.data = undefined;
    // XXX I guess this means it's kosher to mutate properties
    // of a Component during init (but presumably not before
    // or after)?
  },
  render: function (buf) {
    var self = this;
    return function () {
      var condition = getCondition(self);

      // `__content` and `__elseContent` are passed by
      // the compiler and are *not* emboxed, they are just
      // Component kinds.
      return condition ? self.__content : self.__elseContent;
    };
  }
});

// Acts like `!! self.condition()` except:
//
// - Empty array is considered falsy
// - The result is Deps.isolated (doesn't trigger invalidation
//   as long as the condition stays truthy or stays falsy
var getCondition = function (self) {
  return Deps.isolateValue(function () {
    // `condition` is emboxed; it is always a function,
    // and it only triggers invalidation if its return
    // value actually changes.  We still need to isolate
    // the calculation of whether it is truthy or falsy
    // in order to not re-render if it changes from one
    // truthy or falsy value to another.
    var cond = self.condition();

    // empty arrays are treated as falsey values
    if (cond instanceof Array && cond.length === 0)
      return false;
    else
      return !! cond;
  });
};

UI.Unless = Component.extend({
  kind: 'Unless',
  init: function () {
    this.condition = this.data;
    this.data = undefined;
  },
  render: function (buf) {
    var self = this;
    return function () {
      var condition = getCondition(self);
      return (! condition) ? self.__content : self.__elseContent;
    };
  }
});

UI.With = Component.extend({
  kind: 'With',
  init: function () {
    this.condition = this.data;
  },
  render: function (buf) {
    var self = this;
    return function () {
      var condition = getCondition(self);
      return condition ? self.__content : self.__elseContent;
    };
  }
});
