// This depends on tinytest, so it's a little weird to put it in
// test-helpers, but it'll do for now.

var ExpectationManager = function (test, onComplete) {
  var self = this;

  self.test = test;
  self.onComplete = onComplete;
  self.closed = false;
  self.dead = false;
  self.outstanding = 0;
};

_.extend(ExpectationManager.prototype, {
  expect: function (/* arguments */) {
    var self = this;

    if (typeof arguments[0] === "function")
      var expected = arguments[0];
    else
      var expected = _.toArray(arguments);

    if (self.closed)
      throw new Error("Too late to add more expectations to the test");
    self.outstanding++;

    return function (/* arguments */) {
      if (self.dead)
        return;

      if (typeof expected === "function") {
        try {
          expected.apply({}, arguments);
        } catch (e) {
          if (self.cancel())
            self.test.exception(e);
        }
      } else {
        self.test.equal(_.toArray(arguments), expected);
      }

      self.outstanding--;
      self._check_complete();
    };
  },

  done: function () {
    var self = this;
    self.closed = true;
    self._check_complete();
  },

  cancel: function () {
    var self = this;
    if (! self.dead) {
      self.dead = true;
      return true;
    }
    return false;
  },

  _check_complete: function () {
    var self = this;
    if (!self.outstanding && self.closed && !self.dead) {
      self.dead = true;
      self.onComplete();
    }
  }
});

var testAsyncMulti = function (name, funcs) {
  var timeout = 15000;

  Tinytest.addAsync(name, function (test, onComplete) {
    var remaining = _.clone(funcs);

    var runNext = function () {
      var func = remaining.shift();
      if (!func)
        onComplete();
      else {
        var em = new ExpectationManager(test, function () {
          Tinytest.clearTimeout(timer);
          runNext();
        });

        var timer = Tinytest.setTimeout(function () {
          if (em.cancel()) {
            test.fail({type: "timeout", message: "Async batch timed out"});
            onComplete();
          }
          return;
        }, timeout);

        try {
          func(test, _.bind(em.expect, em));
        } catch (exception) {
          if (em.cancel())
            test.exception(exception);
          Tinytest.clearTimeout(timer);
          // Because we called test.exception, we're not to call onComplete.
          return;
        }
        em.done();
      }
    };

    runNext();
  });
};

