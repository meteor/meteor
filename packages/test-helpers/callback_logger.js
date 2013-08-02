// This file allows you to write tests that expect certain callbacks to be
// called in certain orders, or optionally in groups where the order does not
// matter.  It can be set up in either a synchronous manner, so that each
// callback must have already occured before you call expectResult & its ilk, or
// in an asynchronous manner, so that the logger yields and waits a reasonable
// timeout for the callback.  Because we're using Node Fibers to yield & start
// ourselves, the asynchronous version is only available on the server.

var Fiber = Meteor.isServer ? Npm.require('fibers') : null;

var TIMEOUT = 1000;

// Run the given function, passing it a correctly-set-up callback logger as an
// argument.  If we're meant to be running asynchronously, the function gets its
// own Fiber.

withCallbackLogger = function (test, callbackNames, async, fun) {
  var logger = new CallbackLogger(test, callbackNames);
  if (async) {
    if (!Fiber)
      throw new Error("Fiber is not available");
    logger.fiber = Fiber(_.bind(fun, null, logger));
    logger.fiber.run();
  } else {
    fun(logger);
  }
};

var CallbackLogger = function (test, callbackNames) {
  var self = this;
  self._log = [];
  self._test = test;
  self._yielded = false;
  _.each(callbackNames, function (callbackName) {
    self[callbackName] = function () {
      var args = _.toArray(arguments);
      self._log.push({callback: callbackName, args: args});
      if (self.fiber) {
        setTimeout(function () {
          if (self._yielded)
            self.fiber.run(callbackName);
        }, 0);
      }
    };
  });
};

CallbackLogger.prototype._yield = function (arg) {
  var self = this;
  self._yielded = true;
  var y = Fiber.yield(arg);
  self._yielded = false;
  return y;
};

CallbackLogger.prototype.expectResult = function (callbackName, args) {
  var self = this;
  self._waitForLengthOrTimeout(1);
  if (_.isEmpty(self._log)) {
    self._test.fail(["Expected callback " + callbackName + " got none"]);
    return;
  }
  var result = self._log.shift();
  self._test.equal(result.callback, callbackName);
  self._test.equal(result.args, args);
};

CallbackLogger.prototype.expectResultOnly = function (callbackName, args) {
  var self = this;
  self.expectResult(callbackName, args);
  self._expectNoResultImpl();
}

CallbackLogger.prototype._waitForLengthOrTimeout = function (len) {
  var self = this;
  if (self.fiber) {
    var timeLeft = TIMEOUT;
    var startTime = new Date();
    var handle = setTimeout(function () {
      self.fiber.run(handle);
    }, TIMEOUT);
    while (self._log.length < len) {
      if (self._yield() === handle) {
        break;
      }
    }
    clearTimeout(handle);
  }
};

CallbackLogger.prototype.expectResultUnordered = function (list) {
  var self = this;

  self._waitForLengthOrTimeout(list.length);

  list = _.clone(list); // shallow copy.
  var i = list.length;
  while (i > 0) {
    var found = false;
    var dequeued = self._log.shift();
    for (var j = 0; j < list.length; j++) {
      if (_.isEqual(list[j], dequeued)) {
        list.splice(j, 1);
        found = true;
        break;
      }
    }
    if (!found)
      self._test.fail(["Found unexpected result: " + JSON.stringify(dequeued)]);
    i--;
  }
};

CallbackLogger.prototype._expectNoResultImpl = function () {
  var self = this;
  self._test.length(self._log, 0);
};

CallbackLogger.prototype.expectNoResult = function () {
  var self = this;
  if (self.fiber) {
    var handle = setTimeout(function () {
      self.fiber.run(handle);
    }, TIMEOUT);
    var foo = self._yield();
    while (_.isEmpty(self._log) && foo !== handle) {
      foo = self._yield();
    }
    clearTimeout(handle);
  }
  self._expectNoResultImpl();
};
